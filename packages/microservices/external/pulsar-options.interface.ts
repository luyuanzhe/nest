/**
 * @publicApi
 */
export interface PulsarClientOptions {
  serviceUrl: string;
  authentication?: any;
  operationTimeoutSeconds?: number;
  ioThreads?: number;
  messageListenerThreads?: number;
  concurrentLookupRequest?: number;
  useTls?: boolean;
  tlsTrustCertsFilePath?: string;
  tlsValidateHostname?: boolean;
  tlsAllowInsecureConnection?: boolean;
  statsIntervalInSeconds?: number;
}

export interface PulsarConsumerOptions {
  topic: string;
  subscription: string;
  subscriptionType?: 'Exclusive' | 'Shared' | 'Key_Shared' | 'Failover';
  subscriptionInitialPosition?: 'Latest' | 'Earliest';
  ackTimeoutMs?: number;
  nackRedeliverTimeoutMs?: number;
  receiverQueueSize?: number;
  receiverQueueSizeAcrossPartitions?: number;
  consumerName?: string;
  properties?: Record<string, string>;
}

export interface PulsarProducerOptions {
  topic: string;
  producerName?: string;
  sendTimeoutMs?: number;
  initialSequenceId?: number;
  maxPendingMessages?: number;
  maxPendingMessagesAcrossPartitions?: number;
  blockIfQueueFull?: boolean;
  messageRoutingMode?: 'UseSinglePartition' | 'RoundRobinDistribution' | 'CustomPartition';
  hashingScheme?: 'Murmur3_32Hash' | 'BoostHash' | 'JavaStringHash';
  compressionType?: 'Zlib' | 'LZ4' | 'ZSTD' | 'SNAPPY';
  batchingEnabled?: boolean;
  batchingMaxPublishDelayMs?: number;
  batchingMaxMessages?: number;
  properties?: Record<string, string>;
}
