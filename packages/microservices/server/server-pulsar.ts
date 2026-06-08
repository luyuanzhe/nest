import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isString, isUndefined } from '@nestjs/common/utils/shared.utils';
import { EventEmitter } from 'events';
import { finalize } from 'rxjs/operators';
import {
  NO_MESSAGE_HANDLER,
  PULSAR_DEFAULT_SERVICE_URL,
  PULSAR_DEFAULT_SUBSCRIPTION,
  PULSAR_DEFAULT_TOPIC_PREFIX,
} from '../constants';
import { PulsarContext } from '../ctx-host/pulsar.context';
import { Transport } from '../enums';
import {
  PulsarEvents,
  PulsarEventsMap,
  PulsarStatus,
} from '../events/pulsar.events';
import {
  IncomingRequest,
  OutgoingResponse,
  PulsarOptions,
  TransportId,
} from '../interfaces';
import { Server } from './server';

type PulsarClientInstance = any;
type PulsarConsumer = any;
type PulsarProducer = any;
type PulsarMessage = any;

let pulsarPackage = {} as any;

export class ServerPulsar extends Server<PulsarEvents, PulsarStatus> {
  public transportId: TransportId = Transport.PULSAR;

  protected readonly logger = new Logger(ServerPulsar.name);
  protected readonly topicPrefix: string;
  protected readonly subscription: string;
  protected readonly emitter = new EventEmitter();
  protected client: PulsarClientInstance | null = null;
  protected consumers = new Map<string, PulsarConsumer>();
  protected producers = new Map<string, PulsarProducer>();
  protected isClosing = false;

  constructor(
    protected readonly options: Required<PulsarOptions>['options'] = {},
  ) {
    super();
    this.topicPrefix = this.getOptionsProp(
      this.options,
      'topicPrefix',
      PULSAR_DEFAULT_TOPIC_PREFIX,
    );
    this.subscription = this.getOptionsProp(
      this.options,
      'subscription',
      `${PULSAR_DEFAULT_SUBSCRIPTION}-server`,
    );
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public async listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ): Promise<void> {
    try {
      await this.start();
      callback();
    } catch (err) {
      callback(err);
    }
  }

  public async close(): Promise<void> {
    this.isClosing = true;
    this._status$.next(PulsarStatus.DISCONNECTED);
    this.emitter.emit(PulsarEventsMap.DISCONNECT);

    const closeOperations = [
      ...Array.from(this.consumers.values(), consumer => consumer.close?.()),
      ...Array.from(this.producers.values(), producer => producer.close?.()),
      this.client?.close?.(),
    ].filter(Boolean);

    if (closeOperations.length > 0) {
      await Promise.allSettled(closeOperations);
    }

    this.consumers.clear();
    this.producers.clear();
    this.client = null;
  }

  public on<
    EventKey extends keyof PulsarEvents = keyof PulsarEvents,
    EventCallback extends PulsarEvents[EventKey] = PulsarEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    this.emitter.on(event, callback as any);
  }

  public unwrap<T>(): T {
    if (!this.client) {
      throw new Error(
        'Not initialized. Please call the "listen"/"startAllMicroservices" method before accessing the server.',
      );
    }
    return this.client as T;
  }

  public async start(): Promise<void> {
    this.isClosing = false;
    this.client = this.createClient();

    for (const pattern of this.getHandlers().keys()) {
      const topic = this.createRequestTopic(pattern);
      const consumer = await this.createConsumer(topic);
      this.consumers.set(topic, consumer);
      void this.consumeMessages(consumer, topic);
    }

    this._status$.next(PulsarStatus.CONNECTED);
    this.emitter.emit(PulsarEventsMap.CONNECT);
  }

  public async handleMessage(
    message: PulsarMessage,
    consumer: PulsarConsumer,
    topic: string,
  ): Promise<void> {
    const payload = this.parseMessageData(this.getMessageData(message));
    const properties = this.getMessageProperties(message);
    const packet = await this.deserializer.deserialize(payload, {
      properties,
      topic,
    });
    const pattern = isString(packet.pattern)
      ? packet.pattern
      : this.normalizePattern(packet.pattern);
    const context = new PulsarContext([
      message,
      consumer,
      properties.replyTo ? await this.getProducer(properties.replyTo) : null,
      topic,
      pattern,
    ]);

    if (isUndefined((packet as IncomingRequest).id)) {
      await this.handleEvent(pattern, packet, context);
      await this.acknowledge(consumer, message);
      return;
    }

    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      await this.sendMessage(
        {
          id: (packet as IncomingRequest).id,
          err: NO_MESSAGE_HANDLER,
          status: 'error',
        },
        properties.replyTo,
        properties.correlationId,
      );
      await this.acknowledge(consumer, message);
      return;
    }

    try {
      await this.onProcessingStartHook(this.transportId, context, async () => {
        const response$ = this.transformToObservable(
          await handler(packet.data, context),
        ).pipe(
          finalize(() => {
            this.onProcessingEndHook?.(this.transportId, context);
            void this.acknowledge(consumer, message);
          }),
        );

        this.send(response$, data =>
          this.sendMessage(data, properties.replyTo, properties.correlationId),
        );
      });
    } catch (err) {
      await this.sendMessage(
        {
          id: (packet as IncomingRequest).id,
          err,
          status: 'error',
        },
        properties.replyTo,
        properties.correlationId,
      );
      await this.acknowledge(consumer, message);
    }
  }

  protected createClient(): PulsarClientInstance {
    this.loadPulsarPackage();
    const clientOptions = this.getOptionsProp(this.options, 'client', {});
    return new pulsarPackage.Client({
      serviceUrl:
        clientOptions.serviceUrl ?? PULSAR_DEFAULT_SERVICE_URL,
      ...clientOptions,
    });
  }

  protected async createConsumer(topic: string): Promise<PulsarConsumer> {
    return this.client!.subscribe({
      topic,
      subscription: `${this.subscription}-${encodeURIComponent(topic)}`,
      ...this.getOptionsProp(this.options, 'consumer', {}),
    });
  }

  protected async getProducer(topic: string): Promise<PulsarProducer> {
    const existingProducer = this.producers.get(topic);
    if (existingProducer) {
      return existingProducer;
    }
    const producer = await this.client!.createProducer({
      topic,
      ...this.getOptionsProp(this.options, 'producer', {}),
    });
    this.producers.set(topic, producer);
    return producer;
  }

  protected async consumeMessages(
    consumer: PulsarConsumer,
    topic: string,
  ): Promise<void> {
    while (!this.isClosing) {
      try {
        const message = await consumer.receive();
        await this.handleMessage(message, consumer, topic);
      } catch (err) {
        if (this.isClosing) {
          return;
        }
        this._status$.next(PulsarStatus.DISCONNECTED);
        this.emitter.emit(PulsarEventsMap.ERROR, err);
        this.logger.error(err);
        return;
      }
    }
  }

  protected async sendMessage<T = any>(
    message: T,
    replyTo: string,
    correlationId: string,
  ): Promise<void> {
    if (!replyTo || !correlationId) {
      return;
    }
    const producer = await this.getProducer(replyTo);
    const outgoingResponse = this.serializer.serialize(
      message as unknown as OutgoingResponse,
    );

    await producer.send({
      data: Buffer.from(JSON.stringify(outgoingResponse)),
      properties: {
        correlationId,
      },
    });
  }

  protected async acknowledge(
    consumer: PulsarConsumer,
    message: PulsarMessage,
  ): Promise<void> {
    await consumer.acknowledge(message);
  }

  protected loadPulsarPackage() {
    if (pulsarPackage.Client) {
      return;
    }
    pulsarPackage = loadPackage('pulsar-client', ServerPulsar.name, () =>
      require('pulsar-client'),
    );
  }

  protected createRequestTopic(pattern: string): string {
    return this.composeTopic(encodeURIComponent(pattern));
  }

  protected composeTopic(suffix: string): string {
    return this.topicPrefix ? `${this.topicPrefix}.${suffix}` : suffix;
  }

  protected getMessageData(message: PulsarMessage): Buffer {
    return message.getData();
  }

  protected getMessageProperties(
    message: PulsarMessage,
  ): Record<string, string> {
    return message.getProperties?.() ?? {};
  }

  protected parseMessageData(data: Buffer | Uint8Array | string) {
    const rawContent = Buffer.isBuffer(data)
      ? data.toString()
      : Buffer.from(data).toString();
    try {
      return JSON.parse(rawContent);
    } catch {
      return rawContent;
    }
  }
}
