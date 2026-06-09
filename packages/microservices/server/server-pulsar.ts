/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { isString, isUndefined } from '@nestjs/common/utils/shared.utils';
import {
  CONNECTION_FAILED_MESSAGE,
  NO_MESSAGE_HANDLER,
  PULSAR_DEFAULT_NAMESPACE,
  PULSAR_DEFAULT_SUBSCRIPTION,
  PULSAR_DEFAULT_SUBSCRIPTION_TYPE,
  PULSAR_DEFAULT_URL,
} from '../constants';
import { PulsarContext } from '../ctx-host';
import { Transport } from '../enums';
import {
  PulsarEvents,
  PulsarEventsMap,
  PulsarStatus,
} from '../events/pulsar.events';
import { MessageHandler, PulsarOptions, TransportId } from '../interfaces';
import {
  IncomingRequest,
  OutgoingResponse,
  ReadPacket,
} from '../interfaces/packet.interface';
import { PulsarRecordSerializer } from '../serializers/pulsar-record.serializer';
import { Server } from './server';

type PulsarClient = any;
type PulsarProducer = any;
type PulsarConsumer = any;
type PulsarMessage = any;

let pulsarPackage = {} as any;

export class ServerPulsar extends Server<PulsarEvents, PulsarStatus> {
  public transportId: TransportId = Transport.PULSAR;

  protected client: PulsarClient | null = null;
  protected producer: PulsarProducer | null = null;
  protected consumer: PulsarConsumer | null = null;
  protected readonly serviceUrl: string;
  protected readonly namespace: string;
  protected readonly topic: string;
  protected readonly subscription: string;
  protected readonly subscriptionType: string;
  protected readonly subscriptionInitialPosition?: string;
  protected pendingEventListeners: Array<{
    event: keyof PulsarEvents;
    callback: PulsarEvents[keyof PulsarEvents];
  }> = [];

  constructor(protected readonly options: Required<PulsarOptions>['options']) {
    super();
    this.serviceUrl =
      this.getOptionsProp(this.options, 'serviceUrl') || PULSAR_DEFAULT_URL;
    this.namespace =
      this.getOptionsProp(this.options, 'namespace') ||
      PULSAR_DEFAULT_NAMESPACE;
    this.topic = this.getOptionsProp(this.options, 'topic') || '';
    this.subscription =
      this.getOptionsProp(this.options, 'subscription') ||
      PULSAR_DEFAULT_SUBSCRIPTION;
    this.subscriptionType =
      this.getOptionsProp(this.options, 'subscriptionType') ||
      PULSAR_DEFAULT_SUBSCRIPTION_TYPE;
    this.subscriptionInitialPosition = this.getOptionsProp(
      this.options,
      'subscriptionInitialPosition',
    );

    this.loadPackage('pulsar-client', ServerPulsar.name, () =>
      require('pulsar-client'),
    );
    pulsarPackage = this.loadPackage('pulsar-client', ServerPulsar.name, () =>
      require('pulsar-client'),
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
    this.consumer && (await this.consumer.close());
    this.producer && (await this.producer.close());
    this.client && (await this.client.close());
    this.consumer = null;
    this.producer = null;
    this.client = null;
    this.pendingEventListeners = [];
  }

  public async start(
    callback?: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    this.client = this.createClient();
    this._status$.next(PulsarStatus.CONNECTED);

    this.producer = await this.client.createProducer(
      this.getProducerConfig(),
    );

    this.registerConnectListener();
    this.registerDisconnectListener();
    this.pendingEventListeners.forEach(({ event, callback: cb }) => {
      if (this.client) {
        this.client.on?.(event, cb);
      }
    });
    this.pendingEventListeners = [];

    await this.setupConsumer(callback);
  }

  public createClient<T = any>(): T {
    const clientConfig: Record<string, any> = {
      serviceUrl: this.serviceUrl,
    };

    const authentication = this.getOptionsProp(
      this.options,
      'authentication',
    );
    if (authentication) {
      clientConfig.authentication = authentication;
    }

    const tlsTrustCertsFilePath = this.getOptionsProp(
      this.options,
      'tlsTrustCertsFilePath',
    );
    if (tlsTrustCertsFilePath) {
      clientConfig.tlsTrustCertsFilePath = tlsTrustCertsFilePath;
    }

    const tlsAllowInsecureConnection = this.getOptionsProp(
      this.options,
      'tlsAllowInsecureConnection',
    );
    if (tlsAllowInsecureConnection !== undefined) {
      clientConfig.tlsAllowInsecureConnection = tlsAllowInsecureConnection;
    }

    const tlsValidateHostname = this.getOptionsProp(
      this.options,
      'tlsValidateHostname',
    );
    if (tlsValidateHostname !== undefined) {
      clientConfig.tlsValidateHostname = tlsValidateHostname;
    }

    const operationTimeoutSeconds = this.getOptionsProp(
      this.options,
      'operationTimeoutSeconds',
    );
    if (operationTimeoutSeconds !== undefined) {
      clientConfig.operationTimeoutSeconds = operationTimeoutSeconds;
    }

    const connectionTimeoutSeconds = this.getOptionsProp(
      this.options,
      'connectionTimeoutSeconds',
    );
    if (connectionTimeoutSeconds !== undefined) {
      clientConfig.connectionTimeoutSeconds = connectionTimeoutSeconds;
    }

    return new pulsarPackage.Client(clientConfig);
  }

  protected getProducerConfig(): Record<string, any> {
    const config: Record<string, any> = {
      topic: this.getReplyTopic(),
    };

    const producerOptions = this.getOptionsProp(this.options, 'producer');
    if (producerOptions) {
      Object.assign(config, producerOptions);
    }

    return config;
  }

  protected getConsumerConfig(
    topic: string,
  ): Record<string, any> {
    const config: Record<string, any> = {
      topic,
      subscription: this.subscription,
      subscriptionType: this.subscriptionType,
    };

    if (this.subscriptionInitialPosition) {
      config.subscriptionInitialPosition = this.subscriptionInitialPosition;
    }

    const consumerOptions = this.getOptionsProp(this.options, 'consumer');
    if (consumerOptions) {
      Object.assign(config, consumerOptions);
    }

    return config;
  }

  public async setupConsumer(
    callback?: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    const topics = this.getTopicsToSubscribe();

    for (const topic of topics) {
      const consumerConfig = this.getConsumerConfig(topic);
      this.consumer = await this.client.subscribe(consumerConfig);

      this.consumeMessages(this.consumer, topic);
    }

    callback?.();
  }

  protected getTopicsToSubscribe(): string[] {
    if (this.topic) {
      return [this.resolveTopicName(this.topic)];
    }

    const handlers = this.getHandlers();
    const topics = new Set<string>();

    handlers.forEach((_handler, pattern) => {
      topics.add(this.resolveTopicName(pattern));
    });

    if (topics.size === 0) {
      topics.add(this.resolveTopicName('default'));
    }

    return Array.from(topics);
  }

  protected resolveTopicName(pattern: string): string {
    if (pattern.startsWith('persistent://') || pattern.startsWith('non-persistent://')) {
      return pattern;
    }
    return `persistent://${this.namespace}/${pattern}`;
  }

  protected getReplyTopic(): string {
    return this.resolveTopicName('nestjs-reply');
  }

  protected async consumeMessages(
    consumer: PulsarConsumer,
    pattern: string,
  ) {
    try {
      while (true) {
        const msg = await consumer.receive();
        await this.handleMessage(msg, consumer, pattern);
      }
    } catch (err) {
      this.logger.error('Consumer error:', err);
      this._status$.next(PulsarStatus.DISCONNECTED);
    }
  }

  public async handleMessage(
    message: PulsarMessage,
    consumer: PulsarConsumer,
    pattern: string,
  ): Promise<void> {
    const rawMessage = this.parseMessageContent(
      message.getData().toString(),
    );
    const packet = await this.deserializer.deserialize(rawMessage);
    const resolvedPattern = isString(packet.pattern)
      ? packet.pattern
      : JSON.stringify(packet.pattern);

    const pulsarContext = new PulsarContext([message, consumer, resolvedPattern]);

    if (isUndefined((packet as IncomingRequest).id)) {
      return this.handleEvent(resolvedPattern, packet, pulsarContext);
    }

    const handler = this.getHandlerByPattern(resolvedPattern);

    if (!handler) {
      const status = 'error';
      const noHandlerPacket = {
        id: (packet as IncomingRequest).id,
        err: NO_MESSAGE_HANDLER,
        status,
      };
      await this.sendMessage(
        noHandlerPacket,
        message.properties?.replyTo,
        (packet as IncomingRequest).id,
        pulsarContext,
      );
      consumer.acknowledge(message);
      return;
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
            message.properties?.replyTo,
            (packet as IncomingRequest).id,
            pulsarContext,
          );

        response$ && this.send(response$, publish);
        consumer.acknowledge(message);
      },
    );
  }

  public async sendMessage<T = any>(
    message: T,
    replyTo: string,
    correlationId: string,
    context: PulsarContext,
  ): Promise<void> {
    if (!replyTo || !this.producer) {
      return;
    }

    const outgoingResponse = this.serializer.serialize(
      message as unknown as OutgoingResponse,
    );
    const options = outgoingResponse.options;
    delete outgoingResponse.options;

    const payload = Buffer.from(JSON.stringify(outgoingResponse));
    const sendOptions: Record<string, any> = {
      properties: {
        correlationId,
        ...options?.properties,
      },
    };

    if (options?.partitionKey) {
      sendOptions.partitionKey = options.partitionKey;
    }
    if (options?.eventTimestamp) {
      sendOptions.eventTimestamp = options.eventTimestamp;
    }

    this.onProcessingEndHook?.(this.transportId, context);
    await this.producer.send({
      data: payload,
      ...sendOptions,
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
    if (this.client) {
      this.client.on?.(event, callback);
    } else {
      this.pendingEventListeners.push({ event, callback });
    }
  }

  protected initializeSerializer(options: PulsarOptions['options']) {
    this.serializer = options?.serializer ?? new PulsarRecordSerializer();
  }

  private registerConnectListener() {
    this._status$.next(PulsarStatus.CONNECTED);
  }

  private registerDisconnectListener() {
    this.logger.error(CONNECTION_FAILED_MESSAGE);
    this._status$.next(PulsarStatus.DISCONNECTED);
  }

  private parseMessageContent(content: string) {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
}
