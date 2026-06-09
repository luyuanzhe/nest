/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { isFunction, isString } from '@nestjs/common/utils/shared.utils';
import { EventEmitter } from 'events';
import {
  EmptyError,
  firstValueFrom,
  ReplaySubject,
} from 'rxjs';
import { switchMap } from 'rxjs/operators';
import {
  PULSAR_DEFAULT_NAMESPACE,
  PULSAR_DEFAULT_SUBSCRIPTION,
  PULSAR_DEFAULT_SUBSCRIPTION_TYPE,
  PULSAR_DEFAULT_URL,
} from '../constants';
import {
  PulsarEvents,
  PulsarEventsMap,
  PulsarStatus,
} from '../events/pulsar.events';
import { ReadPacket, PulsarOptions, WritePacket } from '../interfaces';
import { PulsarRecord } from '../record-builders';
import { PulsarRecordSerializer } from '../serializers/pulsar-record.serializer';
import { ClientProxy } from './client-proxy';

type PulsarClient = any;
type PulsarProducer = any;
type PulsarConsumer = any;
type PulsarMessage = any;

let pulsarPackage = {} as any;

export class ClientPulsar extends ClientProxy<PulsarEvents, PulsarStatus> {
  protected readonly logger = new Logger(ClientPulsar.name);
  protected connection$: ReplaySubject<any>;
  protected connectionPromise: Promise<void>;
  protected client: PulsarClient | null = null;
  protected producer: PulsarProducer | null = null;
  protected consumer: PulsarConsumer | null = null;
  protected pendingEventListeners: Array<{
    event: keyof PulsarEvents;
    callback: PulsarEvents[keyof PulsarEvents];
  }> = [];
  protected responseEmitter: EventEmitter;
  protected readonly serviceUrl: string;
  protected readonly namespace: string;
  protected readonly topic: string;
  protected readonly subscription: string;
  protected readonly subscriptionType: string;

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

    pulsarPackage = loadPackage('pulsar-client', ClientPulsar.name, () =>
      require('pulsar-client'),
    );

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
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

  public connect(): Promise<any> {
    if (this.client) {
      return this.connectionPromise;
    }
    this.client = this.createClient();

    this.registerErrorListener(this.client);
    this.registerDisconnectListener(this.client);
    this.registerConnectListener(this.client);
    this.pendingEventListeners.forEach(({ event, callback }) => {
      this.client?.on?.(event, callback);
    });
    this.pendingEventListeners = [];

    this.responseEmitter = new EventEmitter();
    this.responseEmitter.setMaxListeners(0);

    const source$ = this.connect$(this.client).pipe(
      switchMap(() => this.setupClient()),
    );

    this.connection$ = new ReplaySubject(1);
    source$.subscribe(this.connection$);
    this.connectionPromise = this.convertConnectionToPromise();

    return this.connectionPromise;
  }

  public createClient(): PulsarClient {
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

  public async setupClient(): Promise<void> {
    const producerConfig: Record<string, any> = {
      topic: this.resolveTopicName(this.topic || 'nestjs-messages'),
    };

    const producerOptions = this.getOptionsProp(this.options, 'producer');
    if (producerOptions) {
      Object.assign(producerConfig, producerOptions);
    }

    this.producer = await this.client.createProducer(producerConfig);

    const replyTopic = this.getReplyTopic();
    const consumerConfig: Record<string, any> = {
      topic: replyTopic,
      subscription: this.subscription + '-reply',
      subscriptionType: this.subscriptionType,
    };

    const consumerOptions = this.getOptionsProp(this.options, 'consumer');
    if (consumerOptions) {
      Object.assign(consumerConfig, consumerOptions);
    }

    this.consumer = await this.client.subscribe(consumerConfig);
    this.consumeReplyMessages();
  }

  protected async consumeReplyMessages() {
    try {
      while (true) {
        const msg = await this.consumer.receive();
        const correlationId = msg.properties?.correlationId;
        if (correlationId) {
          this.responseEmitter.emit(correlationId, msg);
        }
        this.consumer.acknowledge(msg);
      }
    } catch (err) {
      this.logger.error('Reply consumer error:', err);
    }
  }

  protected getReplyTopic(): string {
    return this.resolveTopicName('nestjs-reply');
  }

  protected resolveTopicName(pattern: string): string {
    if (
      pattern.startsWith('persistent://') ||
      pattern.startsWith('non-persistent://')
    ) {
      return pattern;
    }
    return `persistent://${this.namespace}/${pattern}`;
  }

  public async convertConnectionToPromise() {
    try {
      return await firstValueFrom(this.connection$);
    } catch (err) {
      if (err instanceof EmptyError) {
        return;
      }
      throw err;
    }
  }

  public registerErrorListener(client: PulsarClient): void {
    client.on?.(PulsarEventsMap.ERROR, (err: any) =>
      this.logger.error(err),
    );
  }

  public registerDisconnectListener(client: PulsarClient): void {
    client.on?.(PulsarEventsMap.DISCONNECT, (err: any) => {
      this._status$.next(PulsarStatus.DISCONNECTED);
      this.logger.error('Disconnected from Pulsar. Trying to reconnect.');
      this.logger.error(err);
    });
  }

  public registerConnectListener(client: PulsarClient): void {
    client.on?.(PulsarEventsMap.CONNECT, () => {
      this._status$.next(PulsarStatus.CONNECTED);
      this.logger.log('Successfully connected to Pulsar broker');
    });
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

  public unwrap<T>(): T {
    if (!this.client) {
      throw new Error(
        'Not initialized. Please call the "connect" method first.',
      );
    }
    return this.client as T;
  }

  public async handleMessage(
    packet: unknown,
    callback: (packet: WritePacket) => any,
  ): Promise<void>;
  public async handleMessage(
    packet: unknown,
    options: Record<string, unknown>,
    callback: (packet: WritePacket) => any,
  ): Promise<void>;
  public async handleMessage(
    packet: unknown,
    options:
      | Record<string, unknown>
      | ((packet: WritePacket) => any)
      | undefined,
    callback?: (packet: WritePacket) => any,
  ): Promise<void> {
    if (isFunction(options)) {
      callback = options as (packet: WritePacket) => any;
      options = undefined;
    }

    const { err, response, isDisposed } = await this.deserializer.deserialize(
      packet,
      options,
    );
    if (isDisposed || err) {
      return callback?.({
        err,
        response,
        isDisposed: true,
      });
    }
    callback?.({
      err,
      response,
    });
  }

  protected publish(
    message: ReadPacket,
    callback: (packet: WritePacket) => any,
  ): () => void {
    try {
      const correlationId = randomStringGenerator();
      const listener = (msg: PulsarMessage) => {
        const content = msg.getData().toString();
        const parsedContent = this.parseMessageContent(content);
        this.handleMessage(parsedContent, msg.properties, callback);
      };

      Object.assign(message, { id: correlationId });
      const serializedPacket: ReadPacket & Partial<PulsarRecord> =
        this.serializer.serialize(message);

      const options = serializedPacket.options;
      delete serializedPacket.options;

      this.responseEmitter.on(correlationId, listener);

      const content = Buffer.from(JSON.stringify(serializedPacket));
      const sendOptions: Record<string, any> = {
        data: content,
        properties: {
          replyTo: this.getReplyTopic(),
          correlationId,
          ...this.mergeHeaders(options?.properties),
        },
      };

      if (options?.partitionKey) {
        sendOptions.partitionKey = options.partitionKey;
      }
      if (options?.eventTimestamp) {
        sendOptions.eventTimestamp = options.eventTimestamp;
      }

      const targetTopic = this.resolveTopicName(
        isString(message.pattern)
          ? message.pattern
          : JSON.stringify(message.pattern),
      );

      if (this.topic) {
        this.producer!
          .send({
            data: content,
            properties: {
              replyTo: this.getReplyTopic(),
              correlationId,
              ...this.mergeHeaders(options?.properties),
            },
          })
          .catch(err => callback({ err }));
      } else {
        const topicProducer = this.client.createProducer({
          topic: targetTopic,
        });
        topicProducer
          .then((p: PulsarProducer) =>
            p
              .send(sendOptions)
              .then(() => p.close())
              .catch(err => callback({ err })),
          )
          .catch(err => callback({ err }));
      }

      return () =>
        this.responseEmitter.removeListener(correlationId, listener);
    } catch (err) {
      callback({ err });
      return () => {};
    }
  }

  protected async dispatchEvent(packet: ReadPacket): Promise<any> {
    const serializedPacket: ReadPacket & Partial<PulsarRecord> =
      this.serializer.serialize(packet);

    const options = serializedPacket.options;
    delete serializedPacket.options;

    const content = Buffer.from(JSON.stringify(serializedPacket));
    const sendOptions: Record<string, any> = {
      data: content,
      properties: {
        ...this.mergeHeaders(options?.properties),
      },
    };

    if (options?.partitionKey) {
      sendOptions.partitionKey = options.partitionKey;
    }
    if (options?.eventTimestamp) {
      sendOptions.eventTimestamp = options.eventTimestamp;
    }

    const targetTopic = this.resolveTopicName(
      isString(packet.pattern)
        ? packet.pattern
        : JSON.stringify(packet.pattern),
    );

    const topicProducer = await this.client.createProducer({
      topic: targetTopic,
    });

    try {
      await topicProducer.send(sendOptions);
    } finally {
      await topicProducer.close();
    }
  }

  protected initializeSerializer(options: PulsarOptions['options']) {
    this.serializer = options?.serializer ?? new PulsarRecordSerializer();
  }

  protected mergeHeaders(
    requestHeaders?: Record<string, string>,
  ): Record<string, string> | undefined {
    if (!requestHeaders && !this.options?.headers) {
      return undefined;
    }

    return {
      ...this.options?.headers,
      ...requestHeaders,
    };
  }

  protected parseMessageContent(content: string) {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
}
