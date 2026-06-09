import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { Logger } from '@nestjs/common/services/logger.service';
import { isObservable, lastValueFrom } from 'rxjs';
import { Transport } from '../enums';
import { PulsarOptions, TransportId } from '../interfaces';
import { ClientProxy } from './client-proxy';
import { WritePacket, ReadPacket } from '../interfaces';

let pulsarPackage: any = {};

/**
 * @publicApi
 */
export class ClientPulsar extends ClientProxy {
  protected readonly logger = new Logger(ClientPulsar.name);
  protected client: any = null;
  protected producer: any = null;
  protected consumer: any = null;
  protected responseEmitter: any;

  constructor(protected readonly options: Required<PulsarOptions>['options']) {
    super();

    pulsarPackage = loadPackage('pulsar-client', ClientPulsar.name, () =>
      require('pulsar-client'),
    );

    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public async connect(): Promise<any> {
    if (this.client) {
      return this.client;
    }
    this.client = new pulsarPackage.Client(this.options.client || { serviceUrl: 'pulsar://localhost:6650' });
    this.producer = await this.client.createProducer(this.options.producer || { topic: 'nestjs-reply' });
    return this.client;
  }

  public async close(): Promise<void> {
    this.consumer && (await this.consumer.close());
    this.producer && (await this.producer.close());
    this.client && (await this.client.close());
    this.consumer = null;
    this.producer = null;
    this.client = null;
  }

  public async dispatchEvent(packet: ReadPacket): Promise<any> {
    const pattern = this.normalizePattern(packet.pattern);
    const serializedPacket = await this.serializer.serialize(packet);
    
    // In a real implementation we would likely create a producer per pattern,
    // or if dynamic topics are supported, just send to the topic.
    // Assuming the producer can send to multiple topics or we create on the fly.
    // For simplicity, we just use a generic send or assume producer is configured properly.
    if (!this.producer) {
      await this.connect();
    }
    
    // Create a temporary producer if the topic doesn't match the default one
    const producer = await this.client.createProducer({ topic: pattern });
    await producer.send({
      data: Buffer.from(typeof serializedPacket === 'string' ? serializedPacket : JSON.stringify(serializedPacket)),
    });
    await producer.close();
  }

  protected publish(
    packet: ReadPacket,
    callback: (packet: WritePacket) => void,
  ): () => void {
    try {
      this.dispatchEvent(packet)
        .then(() => callback({ response: packet.data }))
        .catch(err => callback({ err }));
    } catch (err) {
      callback({ err });
    }

    return () => {
      // Teardown logic
    };
  }

  public unwrap<T>(): T {
    if (!this.client) {
      throw new Error(
        'Not initialized. Please call the "connect" method before accessing the client.',
      );
    }
    return [this.client, this.consumer, this.producer] as T;
  }
}
