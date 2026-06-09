import {
  isNil,
  isString,
  isUndefined,
} from '@nestjs/common/utils/shared.utils';
import {
  DISCONNECTED_PULSAR_MESSAGE,
  NO_MESSAGE_HANDLER,
  PULSAR_CONNECTION_FAILED_MESSAGE,
  PULSAR_DEFAULT_CONSUMER_NAME,
  PULSAR_DEFAULT_INITIAL_POSITION,
  PULSAR_DEFAULT_SUBSCRIPTION,
  PULSAR_DEFAULT_SUBSCRIPTION_TYPE,
  PULSAR_DEFAULT_TOPIC,
  PULSAR_DEFAULT_URL,
} from '../constants';
import { PulsarContext } from '../ctx-host';
import { Transport } from '../enums';
import {
  PulsarEvents,
  PulsarEventsMap,
  PulsarStatus,
} from '../events/pulsar.events';
import { PulsarOptions, TransportId } from '../interfaces';
import {
  IncomingRequest,
  ReadPacket,
  OutgoingResponse,
} from '../interfaces/packet.interface';
import { Server } from './server';

type Client = any;
type Consumer = any;
type Producer = any;
type Message = any;

let pulsarPackage = {} as any;

/**
 * @publicApi
 */
export class ServerPulsar extends Server<PulsarEvents, PulsarStatus> {
  public transportId: TransportId = Transport.PULSAR;

  protected client: Client | null = null;
  protected consumers = new Map<string, Consumer>();
  protected replyProducers = new Map<string, Producer>();
  protected connectionAttempts = 0;
  protected readonly serviceUrl: string;
  protected readonly clientConfig: Record<string, any>;
  protected readonly consumerConfig: Record<string, any>;
  protected pendingEventListeners: Array<{
    event: keyof PulsarEvents;
    callback: PulsarEvents[keyof PulsarEvents];
  }> = [];

  constructor(protected readonly options: Required<PulsarOptions>['options']) {
    super();
    this.clientConfig =
      this.getOptionsProp(this.options, 'client') || {};
    this.serviceUrl =
      this.clientConfig.serviceUrl || PULSAR_DEFAULT_URL;
    this.consumerConfig =
      this.getOptionsProp(this.options, 'consumer') || {};

    this.loadPackage('pulsar-client', ServerPulsar.name, () =>
      require('pulsar-client'),
    );
    pulsarPackage = this.loadPackage(
      'pulsar-client',
      ServerPulsar.name,
      () => require('pulsar-client'),
    );

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public async listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ): Promise<void> {
    try {
      await this.start(callback);
    } catch (err) {
      callback(err);
    }
  }

  public async close(): Promise<void> {
    for (const consumer of this.consumers.values()) {
      await consumer.close().catch(() => {});
    }
    this.consumers.clear();

    for (const producer of this.replyProducers.values()) {
      await producer.close().catch(() => {});
    }
    this.replyProducers.clear();

    if (this.client) {
      await this.client.close().catch(() => {});
    }
    this.client = null;
    this.pendingEventListeners = [];
  }

  public async start(
    callback?: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    try {
      this.client = this.createClient();
      this._status$.next(PulsarStatus.CONNECTED);

      this.registerErrorListener();

      this.pendingEventListeners.forEach(({ event, callback: cb }) => {
        this.client!.addListener?.(event, cb);
      });
      this.pendingEventListeners = [];

      await this.bindHandlers();
      callback?.();
    } catch (err) {
      this._status$.next(PulsarStatus.DISCONNECTED);
      this.logger.error(PULSAR_CONNECTION_FAILED_MESSAGE);
      if (err) {
        this.logger.error(err);
      }

      const maxConnectionAttempts = this.getOptionsProp(
        this.options,
        'maxConnectionAttempts',
        -1,
      );

      if (
        maxConnectionAttempts === -1 ||
        ++this.connectionAttempts < maxConnectionAttempts
      ) {
        return;
      }
      await this.close();
      callback?.(err ?? new Error(PULSAR_CONNECTION_FAILED_MESSAGE));
    }
  }

  public createClient(): Client {
    const config = { ...this.clientConfig, serviceUrl: this.serviceUrl };
    return new pulsarPackage.Client(config);
  }

  private registerErrorListener() {
    if (this.client?.addListener) {
      this.client.addListener(PulsarEventsMap.ERROR, (err: Error) => {
        this.logger.error(err);
      });
    }
  }

  private async bindHandlers() {
    const handlers = this.getHandlers();
    const topicsToSubscribe = new Set<string>();

    for (const [pattern] of handlers) {
      const topic = this.resolveTopic(pattern);
      topicsToSubscribe.add(topic);
    }

    if (topicsToSubscribe.size === 0) {
      this.logger.warn(
        'No message handlers registered. Pulsar server will not subscribe to any topics.',
      );
      return;
    }

    for (const topic of topicsToSubscribe) {
      try {
        const subscription =
          this.consumerConfig.subscription ||
          `${PULSAR_DEFAULT_SUBSCRIPTION}-${topic}`;
        const subscriptionType =
          this.consumerConfig.subscriptionType ||
          PULSAR_DEFAULT_SUBSCRIPTION_TYPE;
        const consumerName =
          this.consumerConfig.consumerName || PULSAR_DEFAULT_CONSUMER_NAME;
        const initialPosition =
          this.consumerConfig.initialPosition ||
          PULSAR_DEFAULT_INITIAL_POSITION;

        const consumer = await this.client!.subscribe({
          topic,
          subscription,
          subscriptionType,
          consumerName,
          subscriptionInitialPosition: initialPosition,
          listener: (msg: Message, consumer: Consumer) =>
            this.handleMessage(msg, consumer, topic),
          ...this.consumerConfig,
        });

        this.consumers.set(topic, consumer);
      } catch (err) {
        this.logger.error(
          `Failed to subscribe to topic "${topic}": ${err}`,
        );
      }
    }
  }

  public async handleMessage(
    message: Message,
    consumer: Consumer,
    topic: string,
  ): Promise<void> {
    if (isNil(message)) {
      return;
    }

    const rawData = message.getData();
    const parsed = this.parseMessageContent(rawData);
    const properties = message.getProperties();
    const pattern = isString(parsed.pattern)
      ? parsed.pattern
      : JSON.stringify(parsed.pattern);

    const packet = await this.deserializer.deserialize(parsed, properties);
    const pulsarContext = new PulsarContext([message, consumer, pattern]);

    if (isUndefined((packet as IncomingRequest).id)) {
      return this.handleEvent(pattern, packet, pulsarContext);
    }

    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      const status = 'error';
      const noHandlerPacket = {
        id: (packet as IncomingRequest).id,
        err: NO_MESSAGE_HANDLER,
        status,
      };
      this.logger.warn(
        `Pulsar: No message handler for pattern "${pattern}".`,
      );
      return this.sendMessage(
        noHandlerPacket,
        properties.replyTo,
        properties.correlationId,
        pulsarContext,
      );
    }

    return this.onProcessingStartHook(
      this.transportId,
      pulsarContext,
      async () => {
        const response$ = this.transformToObservable(
          await handler(packet.data, pulsarContext),
        );

        const publish = <T>(data: T) =>
          this.sendMessage(
            data,
            properties.replyTo,
            properties.correlationId,
            pulsarContext,
          );

        response$ && this.send(response$, publish);
      },
    );
  }

  public async sendMessage<T = any>(
    message: T,
    replyTo: string,
    correlationId: string,
    context: PulsarContext,
  ): Promise<void> {
    if (!replyTo) {
      this.logger.warn(
        'No replyTo topic specified. Cannot send response message.',
      );
      this.onProcessingEndHook?.(this.transportId, context);
      return;
    }

    const outgoingResponse = this.serializer.serialize(
      message as unknown as OutgoingResponse,
    );
    const options = outgoingResponse.options;
    delete outgoingResponse.options;

    const buffer = Buffer.from(JSON.stringify(outgoingResponse));

    let producer = this.replyProducers.get(replyTo);
    if (!producer) {
      try {
        producer = await this.client!.createProducer({
          topic: replyTo,
          ...this.getOptionsProp(this.options, 'producer', {}),
        });
        this.replyProducers.set(replyTo, producer);
      } catch (err) {
        this.logger.error(`Failed to create producer for topic "${replyTo}"`);
        this.onProcessingEndHook?.(this.transportId, context);
        return;
      }
    }

    this.onProcessingEndHook?.(this.transportId, context);

    await producer.send({
      data: buffer,
      properties: { correlationId, ...options },
    });
  }

  public unwrap<T>(): T {
    if (!this.client) {
      throw new Error(
        'Not initialized. Please call the "listen"/"startAllMicroservices" method before accessing the server.',
      );
    }
    return this.client as T;
  }

  public on<
    EventKey extends keyof PulsarEvents = keyof PulsarEvents,
    EventCallback extends PulsarEvents[EventKey] = PulsarEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    if (this.client?.addListener) {
      this.client.addListener(event, callback);
    } else {
      this.pendingEventListeners.push({ event, callback });
    }
  }

  private resolveTopic(pattern: string): string {
    try {
      const parsed = JSON.parse(pattern);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed.topic || pattern;
      }
    } catch {}
    return pattern;
  }

  private parseMessageContent(data: Buffer) {
    try {
      return JSON.parse(data.toString());
    } catch {
      return data.toString();
    }
  }

  public async handleEvent(
    pattern: string,
    packet: ReadPacket,
    context: PulsarContext,
  ): Promise<any> {
    const consumer = context.getConsumer();
    if (consumer?.acknowledge) {
      await consumer.acknowledge(context.getMessage() as any).catch(() => {});
    }
    return super.handleEvent(pattern, packet, context);
  }
}