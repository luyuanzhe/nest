/**
 * Do NOT add NestJS logic to this interface.  It is meant to ONLY represent the types for the pulsar-client package.
 *
 * @publicApi
 *
 */

/// <reference types="node" />
import * as tls from 'tls';

export declare class Pulsar {
  constructor(config: ClientConfig);
  createProducer(config: ProducerConfig): Promise<Producer>;
  subscribe(config: ConsumerConfig): Promise<Consumer>;
  createReader(config: ReaderConfig): Promise<Reader>;
  close(): Promise<void>;
}

export interface ClientConfig {
  serviceUrl?: string;
  serviceUrlDiscoveryUrl?: string;
  authentication?: Authentication;
  operationTimeoutSeconds?: number;
  ioThreads?: number;
  messageListenerThreads?: number;
  concurrentLookupRequest?: number;
  useTls?: boolean;
  tlsTrustCertsFilePath?: string;
  tlsValidateHostname?: boolean;
  tlsAllowInsecureConnection?: boolean;
  tlsOptions?: tls.ConnectionOptions;
  statsIntervalInSeconds?: number;
  allowTlsInsecureConnection?: boolean;
}

export interface Authentication {
  type: string;
  params: any;
}

export interface AuthenticationTls {
  certificatePath: string;
  privateKeyPath: string;
}

export interface AuthenticationToken {
  token: string;
}

export interface AuthenticationOauth2 {
  audience: string;
  issuerUrl: string;
  privateKey?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface ProducerConfig {
  topic: string;
  producerName?: string;
  sendTimeoutMs?: number;
  initialSequenceId?: number;
  maxPendingMessages?: number;
  maxPendingMessagesAcrossPartitions?: number;
  blockIfQueueFull?: boolean;
  messageRoutingMode?: MessageRoutingMode;
  hashingScheme?: HashingScheme;
  compressionType?: CompressionType;
  batchingEnabled?: boolean;
  batchingMaxPublishDelayMs?: number;
  batchingMaxMessages?: number;
  batchingMaxBytes?: number;
  properties?: Record<string, string>;
  accessMode?: ProducerAccessMode;
  metadata?: Record<string, string>;
}

export interface ConsumerConfig {
  topic?: string;
  topics?: string[];
  topicsPattern?: string;
  subscription: string;
  subscriptionType?: SubscriptionType;
  subscriptionInitialPosition?: SubscriptionInitialPosition;
  receiverQueueSize?: number;
  acknowledgementsGroupTimeMicros?: number;
  maxTotalReceiverQueueSizeAcrossPartitions?: number;
  consumerName?: string;
  ackTimeoutMs?: number;
  ackTimeoutTickTimeMs?: number;
  nAckRedeliveryDelayMs?: number;
  deadLetterPolicy?: DeadLetterPolicy;
  properties?: Record<string, string>;
  readCompacted?: boolean;
  subscriptionProperties?: Record<string, string>;
  listener?: (message: Message, consumer: Consumer) => void;
  retryEnable?: boolean;
  metadata?: Record<string, string>;
}

export interface ReaderConfig {
  topic: string;
  startMessageId: MessageId;
  receiverQueueSize?: number;
  readerName?: string;
  subscriptionRolePrefix?: string;
  readCompacted?: boolean;
  properties?: Record<string, string>;
}

export interface Message {
  getData(): Buffer;
  getProperties(): Record<string, string>;
  getMessageId(): MessageId;
  getPublishTimestamp(): number;
  getEventTimestamp(): number;
  getTopicName(): string;
  getProducerName(): string;
  getSequenceId(): number;
  getSchemaVersion(): Buffer;
  getPartitionKey(): string;
  hasPartitionKey(): boolean;
  getEncryptionCtx(): EncryptionCtx;
  getTopic(): string;
}

export interface MessageId {
  ledgerId: number;
  entryId: number;
  partitionIndex: number;
  batchIndex: number;
  toString(): string;
  toBuffer(): Buffer;
}

export interface ProducerMessage {
  data: Buffer | string;
  properties?: Record<string, string>;
  eventTimestamp?: number;
  sequenceId?: number;
  partitionKey?: string;
  orderingKey?: string;
  replicationClusters?: string[];
  disableReplication?: boolean;
  schema?: Schema;
  deliverAfterMs?: number;
  deliverAt?: number;
}

export interface Producer {
  send(message: ProducerMessage): Promise<MessageId>;
  sendAsync(message: ProducerMessage, callback: (err: Error | null, messageId: MessageId) => void): void;
  flush(): Promise<void>;
  close(): Promise<void>;
  isConnected(): boolean;
  getProducerName(): string;
  getTopic(): string;
  getLastSequenceId(): number;
  getSchemaVersion(): Buffer;
  sendAsync(message: ProducerMessage): Promise<MessageId>;
}

export interface Consumer {
  receive(): Promise<Message>;
  receiveAsync(timeoutMs: number): Promise<Message>;
  acknowledge(message: Message): Promise<void>;
  acknowledge(messageId: MessageId): Promise<void>;
  acknowledgeAsync(message: Message): Promise<void>;
  acknowledgeAsync(messageId: MessageId): Promise<void>;
  acknowledgeCumulative(message: Message): Promise<void>;
  acknowledgeCumulative(messageId: MessageId): Promise<void>;
  negativeAcknowledge(message: Message): void;
  negativeAcknowledge(messageId: MessageId): void;
  close(): Promise<void>;
  isConnected(): boolean;
  getConsumerName(): string;
  getTopic(): string;
  getSubscription(): string;
  seek(messageId: MessageId): Promise<void>;
  seek(timestamp: number): Promise<void>;
  unsubscribe(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  hasMessageAvailable(): Promise<boolean>;
}

export interface Reader {
  hasNext(): Promise<boolean>;
  readNext(): Promise<Message>;
  readNextAsync(timeoutMs: number): Promise<Message>;
  close(): Promise<void>;
  seek(messageId: MessageId): Promise<void>;
  seek(timestamp: number): Promise<void>;
  isConnected(): boolean;
  getTopic(): string;
}

export enum MessageRoutingMode {
  SinglePartition = 0,
  RoundRobinPartition = 1,
  CustomPartition = 2,
}

export enum HashingScheme {
  JavaStringHash = 0,
  Murmur3_32Hash = 1,
  BoostHash = 2,
}

export enum CompressionType {
  None = 0,
  LZ4 = 1,
  ZLib = 2,
  ZSTD = 3,
  Snappy = 4,
}

export enum SubscriptionType {
  Exclusive = 0,
  Shared = 1,
  KeyShared = 2,
  Failover = 3,
}

export enum SubscriptionInitialPosition {
  Latest = 0,
  Earliest = 1,
}

export enum ProducerAccessMode {
  Shared = 0,
  Exclusive = 1,
  ExclusiveWithFencing = 2,
}

export interface DeadLetterPolicy {
  maxRedeliverCount?: number;
  deadLetterTopic?: string;
  initialSubscriptionName?: string;
  retryLetterTopic?: string;
}

export interface Schema {
  type: string;
  schema?: Buffer;
  properties?: Record<string, string>;
}

export interface EncryptionCtx {
  keys: Map<string, Buffer>;
  param: Buffer;
  algorithm: string;
  compressionType: CompressionType;
  uncompressedSize: number;
  batchSize: number;
}

export declare class PulsarError extends Error {
  readonly message: string;
  readonly name: string;
  constructor(message: string);
}
