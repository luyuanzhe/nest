import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { isFunction, isString } from '@nestjs/common/utils/shared.utils';
import { EventEmitter } from 'events';
import {
  EmptyError,
  firstValueFrom,
  fromEvent,
  merge,
  Observable,
  ReplaySubject,
} from 'rxjs';
import { first, map, skip, switchMap } from 'rxjs/operators';
import {
  DISCONNECTED_PULSAR_MESSAGE,
  PULSAR_DEFAULT_REPLY_TOPIC,
  PULSAR_DEFAULT_SUBSCRIPTION,
  PULSAR_DEFAULT_SUBSCRIPTION_TYPE,
  PULSAR_DEFAULT_URL,
} from '../constants';
import {
  PulsarEvents,
  PulsarEventsMap,
  PulsarStatus,
} from '../events/pulsar.events';
import { PulsarOptions, ReadPacket, WritePacket } from '../interfaces';
import { ClientProxy } from './client-proxy';

type Client = any;
type Producer = any;
type Consumer = any;
type Message = any;

let pulsarPackage = {} as any;

export class ClientPulsar extends ClientProxy<PulsarEvents, PulsarStatus> {
  protected readonly logger = new Logger(ClientProxy.name);
  protected connection$: ReplaySubject<any>;
  protected connectionPromise: Promise<void>;
  protected client: Client | null = null;
  protected producer: Producer | null = null;
  protected replyConsumer: Consumer | null = null;
  protected pendingEventListeners: Array<{
    event: keyof PulsarEvents;
    callback: PulsarEvents[keyof PulsarEvents];
  }> = [];
  protected isInitialConnect = true;
  protected responseEmitter: EventEmitter;
  protected readonly serviceUrl: string;
  protected readonly clientConfig: Record<string, any>;
  protected readonly producerConfig: Record<string, any>;
  protected readonly replyConsumerConfig: Record<string, any>;
  protected readonly uniqueId = randomStringGenerator();

  constructor(protected readonly options: Required<PulsarOptions>['options']) {
    super();
    this.clientConfig =
      this.getOptionsProp(this.options, 'client') || {};
    this.serviceUrl =
      this.clientConfig.serviceUrl || PULSAR_DEFAULT_URL;
    this.producerConfig =
      this.getOptionsProp(this.options, 'producer') || {};
    this.replyConsumerConfig =
      this.getOptionsProp(this.options, 'replyConsumer') || {};

    loadPackage('pulsar-client', ClientPulsar.name, () =>
      require('pulsar-client'),
    );
    pulsarPackage = loadPackage('pulsar-client', ClientPulsar.name, () =>
      require('pulsar-client'),
    );

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public async close(): Promise<void> {
    if (this.producer) {
      await this.producer.close().catch(() => {});
      this.producer = null;
    }
    if (this.replyConsumer) {
      await this.replyConsumer.close().catch(() => {});
      this.replyConsumer = null;
    }
    if (this.client) {
      await this.client.close().catch(() => {});
      this.client = null;
    }
    this.pendingEventListeners = [];
  }

  public connect(): Promise<any> {
    if (this.client) {
      return this.connectionPromise;
    }
    this.client = this.createClient();

    this.pendingEventListeners.forEach(({ event, callback }) =>
      this.client!.addListener?.(event, callback),
    );
    this.pendingEventListeners = [];

    this.responseEmitter = new EventEmitter();
    this.responseEmitter.setMaxListeners(0);

    const connect$ = this.connect$(this.client);
    const withSetup$ = connect$.pipe(
      switchMap(() => this.setupReplyConsumer()),
    );

    const withReconnect$ = fromEvent(this.client, PulsarEventsMap.CONNECT).pipe(
      skip(1),
    );
    const source$ = merge(withSetup$, withReconnect$);

    this.connection$ = new ReplaySubject(1);
    source$.subscribe(this.connection$);
    this.connectionPromise = this.convertConnectionToPromise();

    return this.connectionPromise;
  }

  public createClient(): Client {
    const config = { ...this.clientConfig, serviceUrl: this.serviceUrl };
    return new pulsarPackage.Client(config);
  }

  public async setupReplyConsumer(): Promise<void> {
    const replyTopic =
      this.getOptionsProp(this.replyConsumerConfig, 'topic') ||
      `${PULSAR_DEFAULT_REPLY_TOPIC || `pulsar.reply.${this.uniqueId}`}`;

    const subscription =
      this.getOptionsProp(
        this.replyConsumerConfig,
        'subscription',
      ) || `${PULSAR_DEFAULT_SUBSCRIPTION}-reply-${this.uniqueId}`;

    const subscriptionType =
      this.getOptionsProp(
        this.replyConsumerConfig,
        'subscriptionType',
      ) || PULSAR_DEFAULT_SUBSCRIPTION_TYPE;

    this.replyConsumer = await this.client!.subscribe({
      topic: replyTopic,
      subscription,
      subscriptionType,
      listener: (msg: Message) => this.handleReplyMessage(msg),
      ...this.replyConsumerConfig,
    });
  }

  private handleReplyMessage(msg: Message) {
    const content = msg.getData();
    const parsed = JSON.parse(content.toString());
    const correlationId = parsed?.correlationId || msg.getProperties()?.correlationId;
    if (correlationId) {
      this.responseEmitter.emit(correlationId, {
        content: parsed,
        message: msg,
      });
    }
  }

  public connect$(instance: any): Observable<any> {
    try {
      return new Observable(observer => {
        observer.next(instance);
        observer.complete();
      });
    } catch (err) {
      return new Observable(observer => {
        observer.error(err);
      });
    }
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

  protected async getProducer(): Promise<Producer> {
    if (this.producer) {
      return this.producer;
    }
    this.producer = await this.client!.createProducer({
      ...this.producerConfig,
    });
    return this.producer;
  }

  protected publish(
    message: ReadPacket,
    callback: (packet: WritePacket) => any,
  ): () => void {
    try {
      const correlationId = randomStringGenerator();
      const listener = (response: { content: any; message: any }) =>
        this.handleMessage(response.content, callback);

      Object.assign(message, { id: correlationId });
      const serializedPacket = this.serializer.serialize(message);

      const options = serializedPacket.options;
      delete serializedPacket.options;

      this.responseEmitter.on(correlationId, listener);

      const topic = this.resolveTopic(message.pattern);
      const data = Buffer.from(JSON.stringify(serializedPacket));

      const sendMessage = async () => {
        try {
          const producer = await this.getProducer();
          await producer.send({
            data,
            properties: {
              correlationId,
              ...options,
              replyTo: this.resolveReplyTopic(),
            },
          });
        } catch (err) {
          callback({ err });
        }
      };

      sendMessage();

      return () =>
        this.responseEmitter.removeListener(correlationId, listener);
    } catch (err) {
      callback({ err });
      return () => {};
    }
  }

  protected async dispatchEvent(packet: ReadPacket): Promise<any> {
    const serializedPacket = this.serializer.serialize(packet);
    const options = serializedPacket.options;
    delete serializedPacket.options;

    const topic = this.resolveTopic(packet.pattern);
    const data = Buffer.from(JSON.stringify(serializedPacket));

    const producer = await this.getProducer();
    await producer.send({
      data,
      properties: { ...options },
    });
  }

  private resolveTopic(pattern: any): string {
    try {
      const parsed = JSON.parse(pattern);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed.topic || pattern;
      }
    } catch {}
    if (isString(pattern)) {
      return pattern;
    }
    return JSON.stringify(pattern);
  }

  private resolveReplyTopic(): string {
    return (
      this.getOptionsProp(this.replyConsumerConfig, 'topic') ||
      `pulsar.reply.${this.uniqueId}`
    );
  }

  public registerErrorListener(client: Client): void {
    if (client?.addListener) {
      client.addListener(PulsarEventsMap.ERROR, (err: Error) =>
        this.logger.error(err),
      );
    }
  }

  public registerConnectListener(client: Client): void {
    if (client?.addListener) {
      client.addListener(PulsarEventsMap.CONNECT, () => {
        this._status$.next(PulsarStatus.CONNECTED);
        this.logger.log('Successfully connected to Pulsar broker');
      });
    }
  }

  public registerCloseListener(client: Client): void {
    if (client?.addListener) {
      client.addListener(PulsarEventsMap.CLOSE, () => {
        this._status$.next(PulsarStatus.DISCONNECTED);
        this.logger.error(DISCONNECTED_PULSAR_MESSAGE);
      });
    }
  }
}