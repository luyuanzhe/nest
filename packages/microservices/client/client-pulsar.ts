import { Logger } from '@nestjs/common/services/logger.service';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isNil, isUndefined } from '@nestjs/common/utils/shared.utils';
import {
  throwError as _throw,
  connectable,
  defer,
  Observable,
  Subject,
} from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import {
  PULSAR_DEFAULT_SERVICE_URL,
  PULSAR_DEFAULT_CLIENT,
  PULSAR_DEFAULT_SUBSCRIPTION,
} from '../constants';
import { PulsarStatus } from '../events';
import {
  Pulsar,
  Consumer,
  Producer,
  ClientConfig,
  ConsumerConfig,
  ProducerConfig,
  Message,
} from '../external/pulsar.interface';
import {
  PulsarOptions,
  MsPattern,
  ReadPacket,
  WritePacket,
} from '../interfaces';
import { ClientProxy } from './client-proxy';

let pulsarPackage: any = {};

/**
 * @publicApi
 */
export class ClientPulsar extends ClientProxy<never, PulsarStatus> {
  protected logger = new Logger(ClientPulsar.name);
  protected client: Pulsar | null = null;
  protected initialized: Promise<void> | null = null;
  protected responsePatterns: string[] = [];
  protected consumers: Map<string, Consumer> = new Map();
  protected _producer: Producer | null = null;
  protected producerOnlyMode: boolean;
  protected serviceUrl: string;
  protected clientId: string;

  get producer(): Producer {
    if (!this._producer) {
      throw new Error(
        'No producer initialized. Please, call the "connect" method first.',
      );
    }
    return this._producer;
  }

  constructor(protected readonly options: Required<PulsarOptions>['options']) {
    super();

    const clientOptions = this.getOptionsProp(this.options, 'client', {} as ClientConfig);
    const consumerOptions = this.getOptionsProp(this.options, 'consumer', {} as ConsumerConfig);
    const producerOptions = this.getOptionsProp(this.options, 'producer', {} as ProducerConfig);
    const postfixId = this.getOptionsProp(this.options, 'postfixId', '-client');
    this.producerOnlyMode = this.getOptionsProp(
      this.options,
      'producerOnlyMode',
      false,
    );

    this.serviceUrl = clientOptions.serviceUrl || PULSAR_DEFAULT_SERVICE_URL;
    this.clientId = `${clientOptions.clientId || PULSAR_DEFAULT_CLIENT}${postfixId}`;

    pulsarPackage = loadPackage('pulsar-client', ClientPulsar.name, () =>
      require('pulsar-client'),
    );

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public subscribeToResponseOf(pattern: unknown): void {
    const request = this.normalizePattern(pattern as MsPattern);
    this.responsePatterns.push(this.getResponsePatternName(request));
  }

  public async close(): Promise<void> {
    for (const [_, consumer] of this.consumers) {
      await consumer.close();
    }
    this.consumers.clear();

    if (this._producer) {
      await this._producer.close();
      this._producer = null;
    }

    if (this.client) {
      await this.client.close();
      this.client = null;
    }

    this.initialized = null;
  }

  public async connect(): Promise<Producer> {
    if (this.initialized) {
      return this.initialized.then(() => this._producer!);
    }

    this.initialized = new Promise(async (resolve, reject) => {
      try {
        this.client = this.createClient();
        this._status$.next(PulsarStatus.CONNECTED);

        if (!this.producerOnlyMode) {
          await this.bindTopics();
        }

        this._producer = await this.createProducer();
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    return this.initialized.then(() => this._producer!);
  }

  public async bindTopics(): Promise<void> {
    const postfixId = this.getOptionsProp(this.options, 'postfixId', '-client');
    const consumerOptions = this.getOptionsProp(this.options, 'consumer', {} as ConsumerConfig);
    const subscription = `${consumerOptions.subscription || PULSAR_DEFAULT_SUBSCRIPTION}${postfixId}`;

    for (const pattern of this.responsePatterns) {
      const consumer = await this.client!.subscribe({
        ...consumerOptions,
        topic: pattern,
        subscription,
        listener: async (msg: Message, consumer: Consumer) => {
          await this.createResponseCallback(msg, consumer);
        },
      });
      this.consumers.set(pattern, consumer);
    }
  }

  public createClient<T = any>(): T {
    const clientOptions = this.getOptionsProp(this.options, 'client', {} as ClientConfig);
    return new pulsarPackage.Client({
      ...clientOptions,
      serviceUrl: this.serviceUrl,
    });
  }

  protected async createResponseCallback(msg: Message, consumer: Consumer): Promise<void> {
    const properties = msg.getProperties();
    if (isUndefined(properties['nest-correlation-id'])) {
      await consumer.acknowledge(msg);
      return;
    }

    const id = properties['nest-correlation-id'];
    const callback = this.routingMap.get(id);
    if (!callback) {
      await consumer.acknowledge(msg);
      return;
    }

    const isDisposed = properties['nest-is-disposed'] === 'true';
    const err = properties['nest-err'] ? JSON.parse(properties['nest-err']) : null;
    const response = await this.deserializer.deserialize(msg);

    await consumer.acknowledge(msg);

    if (err || isDisposed) {
      return callback({
        err,
        response,
        isDisposed,
      });
    }

    callback({
      err,
      response,
    });
  }

  public unwrap<T>(): T {
    if (!this.client) {
      throw new Error(
        'Not initialized. Please call the "connect" method first.',
      );
    }
    return this.client as T;
  }

  public on<
    EventKey extends string | number | symbol = string | number | symbol,
    EventCallback = any,
  >(event: EventKey, callback: EventCallback) {
    throw new Error('Method is not supported for Pulsar client');
  }

  protected async dispatchEvent(packet: ReadPacket): Promise<any> {
    const pattern = this.normalizePattern(packet.pattern);
    const outgoingEvent = await this.serializer.serialize(packet.data, {
      pattern,
    });

    const message = {
      data: outgoingEvent,
    };

    return this.producer.send(message);
  }

  protected publish(
    partialPacket: ReadPacket,
    callback: (packet: WritePacket) => any,
  ): () => void {
    const packet = this.assignPacketId(partialPacket);
    this.routingMap.set(packet.id, callback);

    const cleanup = () => this.routingMap.delete(packet.id);
    const errorCallback = (err: unknown) => {
      cleanup();
      callback({ err });
    };

    try {
      const pattern = this.normalizePattern(partialPacket.pattern);
      const replyTopic = this.getResponsePatternName(pattern);

      Promise.resolve(this.serializer.serialize(packet.data, { pattern }))
        .then((serializedPacket: any) => {
          const properties: Record<string, string> = {
            'nest-correlation-id': packet.id,
            'nest-reply-topic': replyTopic,
          };

          return this.producer.send({
            data: serializedPacket,
            properties,
          });
        })
        .catch(err => errorCallback(err));

      return cleanup;
    } catch (err) {
      errorCallback(err);
      return () => null;
    }
  }

  protected async createProducer(): Promise<Producer> {
    const producerOptions = this.getOptionsProp(this.options, 'producer', {} as ProducerConfig);
    return this.client!.createProducer(producerOptions);
  }

  protected getResponsePatternName(pattern: string): string {
    return `${pattern}.reply`;
  }
}
