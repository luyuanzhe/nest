import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { Logger } from '@nestjs/common/services/logger.service';
import { isObservable, lastValueFrom, Observable, ReplaySubject } from 'rxjs';
import { NO_EVENT_HANDLER, NO_MESSAGE_HANDLER } from '../constants';
import { Transport } from '../enums';
import { PulsarOptions, TransportId } from '../interfaces';
import { Server } from './server';

let pulsarPackage: any = {};

/**
 * @publicApi
 */
export class ServerPulsar extends Server {
  public readonly transportId: TransportId = Transport.PULSAR;

  protected logger = new Logger(ServerPulsar.name);
  protected client: any = null;
  protected consumer: any = null;
  protected producer: any = null;

  constructor(protected readonly options: Required<PulsarOptions>['options']) {
    super();

    pulsarPackage = loadPackage('pulsar-client', ServerPulsar.name, () =>
      require('pulsar-client'),
    );

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public async listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ): Promise<void> {
    try {
      this.client = new pulsarPackage.Client(this.options.client || { serviceUrl: 'pulsar://localhost:6650' });
      await this.start(callback);
    } catch (err) {
      callback(err);
    }
  }

  public async start(callback: () => void): Promise<void> {
    const registeredPatterns = [...this.messageHandlers.keys()];

    if (registeredPatterns.length > 0) {
      this.consumer = await this.client.subscribe({
        ...this.options.consumer,
        topics: registeredPatterns,
        subscription: this.options.consumer?.subscription || 'nestjs-subscription',
        listener: this.getMessageHandler(),
      });
    }

    callback();
  }

  public async close(): Promise<void> {
    this.consumer && (await this.consumer.close());
    this.producer && (await this.producer.close());
    this.client && (await this.client.close());
    this.consumer = null;
    this.producer = null;
    this.client = null;
  }

  public getMessageHandler() {
    return async (message: any, consumer: any) => this.handleMessage(message, consumer);
  }

  public async handleMessage(message: any, consumer: any) {
    const rawMessage = message.getData().toString();
    const packet = await this.deserializer.deserialize(rawMessage, { channel: message.getTopicName() });
    
    const handler = this.getHandlerByPattern(packet.pattern);
    
    if (handler?.isEventHandler) {
      consumer.acknowledge(message);
      return this.handleEvent(packet.pattern, packet, message);
    }

    // In a real implementation we would need to handle correlation id and reply topics
    if (!handler) {
      consumer.acknowledge(message);
      return;
    }
    
    const response$ = this.transformToObservable(
      handler(packet.data, message),
    );

    await lastValueFrom(response$).catch(() => null);
    consumer.acknowledge(message);
  }

  public on<
    EventKey extends string | number | symbol = string | number | symbol,
    EventCallback = any,
  >(event: EventKey, callback: EventCallback) {
    throw new Error('Method is not supported for Pulsar server');
  }

  public unwrap<T>(): T {
    if (!this.client) {
      throw new Error(
        'Not initialized. Please call the "listen"/"startAllMicroservices" method before accessing the server.',
      );
    }
    return [this.client, this.consumer, this.producer] as T;
  }
}
