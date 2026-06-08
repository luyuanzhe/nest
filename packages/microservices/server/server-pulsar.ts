import { Logger } from '@nestjs/common/services/logger.service';
import { isObservable, lastValueFrom } from 'rxjs';
import {
  PULSAR_DEFAULT_CLIENT,
  PULSAR_DEFAULT_SERVICE_URL,
  PULSAR_DEFAULT_SUBSCRIPTION,
  NO_EVENT_HANDLER,
} from '../constants';
import { PulsarContext } from '../ctx-host';
import { Transport } from '../enums';
import { PulsarStatus } from '../events';
import {
  Pulsar,
  Consumer,
  Producer,
  Message,
  ConsumerConfig,
  ClientConfig,
  ProducerConfig,
} from '../external/pulsar.interface';
import { PulsarOptions, ReadPacket } from '../interfaces';
import { Server } from './server';

let pulsarPackage: any = {};

/**
 * @publicApi
 */
export class ServerPulsar extends Server<never, PulsarStatus> {
  public transportId: Transport = Transport.PULSAR;
  protected logger = new Logger(ServerPulsar.name);
  protected client: Pulsar | null = null;
  protected consumers: Map<string, Consumer> = new Map();
  protected producer: Producer | null = null;
  protected parser: any = null;

  constructor(protected readonly options: Required<PulsarOptions>['options']) {
    super();
    const clientOptions = this.getOptionsProp(options, 'client', {} as ClientConfig);
    const consumerOptions = this.getOptionsProp(options, 'consumer', {} as ConsumerConfig);
    const producerOptions = this.getOptionsProp(options, 'producer', {} as ProducerConfig);
    const postfixId = this.getOptionsProp(options, 'postfixId', '-server');

    pulsarPackage = this.loadPackage('pulsar-client', ServerPulsar.name, () =>
      require('pulsar-client'),
    );

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public async listen(callback: (err?: unknown) => void): Promise<void> {
    try {
      this.client = this.createClient();
      await this.start(callback);
    } catch (err) {
      callback(err);
    }
  }

  public async close(): Promise<void> {
    for (const [_, consumer] of this.consumers) {
      await consumer.close();
    }
    this.consumers.clear();
    if (this.producer) {
      await this.producer.close();
      this.producer = null;
    }
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  public async start(callback: (err?: unknown) => void): Promise<void> {
    this._status$.next(PulsarStatus.CONNECTED);
    await this.bindEvents();
    callback();
  }

  public createClient(): Pulsar {
    const clientOptions = this.getOptionsProp(this.options, 'client', {} as ClientConfig);
    const serviceUrl = clientOptions.serviceUrl || PULSAR_DEFAULT_SERVICE_URL;
    return new pulsarPackage.Client({
      ...clientOptions,
      serviceUrl,
    });
  }

  public async bindEvents(): Promise<void> {
    const registeredPatterns = [...this.messageHandlers.keys()];
    const postfixId = this.getOptionsProp(this.options, 'postfixId', '-server');

    for (const pattern of registeredPatterns) {
      const consumerConfig = this.getOptionsProp(this.options, 'consumer', {} as ConsumerConfig);
      const subscription = `${consumerConfig.subscription || PULSAR_DEFAULT_SUBSCRIPTION}${postfixId}`;

      const consumer = await this.client!.subscribe({
        ...consumerConfig,
        topic: pattern,
        subscription,
        listener: async (msg: Message, consumer: Consumer) => {
          await this.handleMessage(msg, consumer);
        },
      });

      this.consumers.set(pattern, consumer);
    }
  }

  public async handleMessage(msg: Message, consumer: Consumer): Promise<void> {
    const topic = msg.getTopicName();
    const rawMessage = this.parser ? this.parser.parse(msg) : msg;
    const properties = rawMessage.getProperties();

    const packet = await this.deserializer.deserialize(rawMessage, { channel: topic });
    const handler = this.getHandlerByPattern(packet.pattern);

    if (!this.producer) {
      this.producer = await this.createProducer();
    }

    const pulsarContext = new PulsarContext([
      rawMessage,
      topic,
      consumer,
      this.producer,
    ]);

    if (handler?.isEventHandler || !properties['nest-reply-topic']) {
      await this.handleEvent(packet.pattern, packet, pulsarContext);
      await consumer.acknowledge(msg);
      return;
    }

    await this.handleMessageRequest(packet, pulsarContext, consumer, msg, properties);
  }

  protected async handleMessageRequest(
    packet: ReadPacket,
    context: PulsarContext,
    consumer: Consumer,
    originalMsg: Message,
    properties: Record<string, string>,
  ): Promise<void> {
    const replyTopic = properties['nest-reply-topic'];
    const correlationId = properties['nest-correlation-id'];

    const publish = this.getPublisher(replyTopic, correlationId, context);
    const handler = this.getHandlerByPattern(packet.pattern);

    if (!handler) {
      return publish({
        id: correlationId,
        err: NO_EVENT_HANDLER,
      });
    }

    try {
      await this.onProcessingStartHook(this.transportId, context, async () => {
        const response$ = this.transformToObservable(
          handler(packet.data, context),
        );
        await lastValueFrom(response$);
        this.send(response$, publish);
        await consumer.acknowledge(originalMsg);
      });
    } catch (err) {
      await this.handleError(err);
    }
  }

  public getPublisher(
    replyTopic: string,
    correlationId: string,
    context: PulsarContext,
  ): (data: any) => Promise<any> {
    return async (data: any) => {
      const outgoingMessage = await this.serializer.serialize(data.response);
      const properties: Record<string, string> = {
        'nest-correlation-id': correlationId,
      };

      if (data.isDisposed) {
        properties['nest-is-disposed'] = 'true';
      }

      if (data.err) {
        properties['nest-err'] = JSON.stringify(data.err);
      }

      const producer = context.getProducer();
      await producer.send({
        data: outgoingMessage,
        properties,
      });

      this.onProcessingEndHook?.(this.transportId, context);
    };
  }

  protected async createProducer(): Promise<Producer> {
    const producerOptions = this.getOptionsProp(this.options, 'producer', {} as ProducerConfig);
    return this.client!.createProducer({
      ...producerOptions,
    });
  }

  public unwrap<T>(): T {
    if (!this.client) {
      throw new Error(
        'Not initialized. Please call the "listen"/"startAllMicroservices" method before accessing the server.',
      );
    }
    return {
      client: this.client,
      consumers: Array.from(this.consumers.values()),
      producer: this.producer,
    } as unknown as T;
  }

  public on<
    EventKey extends string | number | symbol = string | number | symbol,
    EventCallback = any,
  >(event: EventKey, callback: EventCallback) {
    throw new Error('Method is not supported for Pulsar server');
  }

  public async handleEvent(
    pattern: string,
    packet: ReadPacket,
    context: PulsarContext,
  ): Promise<any> {
    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      return this.logger.error(NO_EVENT_HANDLER);
    }

    return this.onProcessingStartHook(this.transportId, context, async () => {
      const resultOrStream = await handler(packet.data, context);
      if (isObservable(resultOrStream)) {
        await lastValueFrom(resultOrStream);
        this.onProcessingEndHook?.(this.transportId, context);
      }
    });
  }
}
