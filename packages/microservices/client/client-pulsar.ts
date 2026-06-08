import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { EventEmitter } from 'events';
import {
  PULSAR_DEFAULT_REPLY_TOPIC,
  PULSAR_DEFAULT_SERVICE_URL,
  PULSAR_DEFAULT_SUBSCRIPTION,
  PULSAR_DEFAULT_TOPIC_PREFIX,
} from '../constants';
import {
  PulsarEvents,
  PulsarEventsMap,
  PulsarStatus,
} from '../events/pulsar.events';
import { PulsarOptions, ReadPacket, WritePacket } from '../interfaces';
import { ClientProxy } from './client-proxy';

type PulsarClientInstance = any;
type PulsarConsumer = any;
type PulsarProducer = any;
type PulsarMessage = any;

let pulsarPackage = {} as any;

export class ClientPulsar extends ClientProxy<PulsarEvents, PulsarStatus> {
  protected readonly logger = new Logger(ClientPulsar.name);
  protected readonly clientId: string;
  protected readonly topicPrefix: string;
  protected readonly replyTopic: string;
  protected readonly subscription: string;
  protected readonly emitter = new EventEmitter();
  protected client: PulsarClientInstance | null = null;
  protected consumer: PulsarConsumer | null = null;
  protected producers = new Map<string, PulsarProducer>();
  protected connectionPromise: Promise<void> | null = null;
  protected isConnected = false;
  protected isClosing = false;

  constructor(
    protected readonly options: Required<PulsarOptions>['options'] = {},
  ) {
    super();
    this.clientId = this.getOptionsProp(
      this.options,
      'clientId',
      randomStringGenerator(),
    );
    this.topicPrefix = this.getOptionsProp(
      this.options,
      'topicPrefix',
      PULSAR_DEFAULT_TOPIC_PREFIX,
    );
    this.replyTopic = this.getOptionsProp(
      this.options,
      'replyTopic',
      this.createReplyTopic(this.clientId),
    );
    this.subscription = this.getOptionsProp(
      this.options,
      'subscription',
      `${PULSAR_DEFAULT_SUBSCRIPTION}-client-${this.clientId}`,
    );
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public async connect(): Promise<any> {
    if (this.isConnected) {
      return;
    }
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    this.connectionPromise = this.initializeConnection();
    try {
      await this.connectionPromise;
    } catch (err) {
      this.connectionPromise = null;
      throw err;
    }
  }

  public async close(): Promise<void> {
    this.isClosing = true;
    this.isConnected = false;
    this.connectionPromise = null;
    this._status$.next(PulsarStatus.DISCONNECTED);
    this.emitter.emit(PulsarEventsMap.DISCONNECT);

    const closeOperations = [
      ...Array.from(this.producers.values(), producer => producer.close?.()),
      this.consumer?.close?.(),
      this.client?.close?.(),
    ].filter(Boolean);

    if (closeOperations.length > 0) {
      await Promise.allSettled(closeOperations);
    }

    this.consumer = null;
    this.client = null;
    this.producers.clear();

    if (this.routingMap.size > 0) {
      const err = new Error('Connection closed');
      for (const callback of this.routingMap.values()) {
        callback({ err });
      }
      this.routingMap.clear();
    }
  }

  public on<
    EventKey extends keyof PulsarEvents = keyof PulsarEvents,
    EventCallback extends PulsarEvents[EventKey] = PulsarEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    this.emitter.on(event, callback as any);
  }

  public unwrap<T>(): T {
    if (!this.client) {
      throw new Error('Not initialized. Please call the "connect" method first.');
    }
    return this.client as T;
  }

  public async handleMessage(
    message: PulsarMessage,
    callback: (packet: WritePacket) => any,
  ): Promise<void> {
    const payload = this.parseMessageData(this.getMessageData(message));
    const properties = this.getMessageProperties(message);
    const { err, response, isDisposed } = await this.deserializer.deserialize(
      payload,
      {
        properties,
        topic: this.getMessageTopic(message),
      },
    );

    if (isDisposed || err) {
      return callback({
        err,
        response,
        isDisposed: true,
      });
    }
    callback({
      err,
      response,
    });
  }

  protected publish(
    packet: ReadPacket,
    callback: (packet: WritePacket) => any,
  ): () => void {
    try {
      const pattern = this.normalizePattern(packet.pattern);
      const outgoingPacket = this.assignPacketId({
        ...packet,
        pattern,
      });

      this.routingMap.set(outgoingPacket.id, callback);
      void this.sendPacket(outgoingPacket, {
        correlationId: outgoingPacket.id,
        replyTo: this.replyTopic,
      }).catch(err => callback({ err }));

      return () => this.routingMap.delete(outgoingPacket.id);
    } catch (err) {
      callback({ err });
      return () => undefined;
    }
  }

  protected async dispatchEvent(packet: ReadPacket): Promise<any> {
    const pattern = this.normalizePattern(packet.pattern);
    await this.sendPacket(
      {
        ...packet,
        pattern,
      },
      {},
    );
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

  protected async createConsumer(): Promise<PulsarConsumer> {
    return this.client!.subscribe({
      topic: this.replyTopic,
      subscription: this.subscription,
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

  protected async initializeConnection(): Promise<void> {
    this.isClosing = false;
    this.client = this.createClient();
    this.consumer = await this.createConsumer();
    this.isConnected = true;
    this._status$.next(PulsarStatus.CONNECTED);
    this.emitter.emit(PulsarEventsMap.CONNECT);
    void this.consumeResponses();
  }

  protected async consumeResponses(): Promise<void> {
    while (!this.isClosing && this.consumer) {
      try {
        const message = await this.consumer.receive();
        const correlationId = this.getMessageProperties(message).correlationId;
        const callback = this.routingMap.get(correlationId);

        if (callback) {
          await this.handleMessage(
            message,
            callback as (packet: WritePacket) => any,
          );
        }

        await this.consumer.acknowledge(message);
      } catch (err) {
        if (this.isClosing) {
          return;
        }
        this.isConnected = false;
        this.connectionPromise = null;
        this._status$.next(PulsarStatus.DISCONNECTED);
        this.emitter.emit(PulsarEventsMap.ERROR, err);
        this.logger.error(err);
        return;
      }
    }
  }

  protected async sendPacket(
    packet: ReadPacket,
    properties: Record<string, string>,
  ): Promise<void> {
    await this.connect();
    const producer = await this.getProducer(
      this.createRequestTopic(packet.pattern as string),
    );
    const serializedPacket = this.serializer.serialize(packet);

    await producer.send({
      data: Buffer.from(JSON.stringify(serializedPacket)),
      properties,
    });
  }

  protected loadPulsarPackage() {
    if (pulsarPackage.Client) {
      return;
    }
    pulsarPackage = loadPackage('pulsar-client', ClientPulsar.name, () =>
      require('pulsar-client'),
    );
  }

  protected createReplyTopic(clientId: string): string {
    return this.composeTopic(`${PULSAR_DEFAULT_REPLY_TOPIC}.${clientId}`);
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

  protected getMessageTopic(message: PulsarMessage): string {
    return message.getTopicName?.() ?? this.replyTopic;
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
