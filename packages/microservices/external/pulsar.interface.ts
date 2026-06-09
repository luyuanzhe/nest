export interface PulsarClientConfig {
  serviceUrl: string;
  operationTimeoutSeconds?: number;
  ioThreads?: number;
  messageListenerThreads?: number;
  concurrentLookupRequest?: number;
  tlsTrustCertsFilePath?: string;
  tlsValidateHostname?: boolean;
  tlsAllowInsecureConnection?: boolean;
  statsIntervalInSeconds?: number;
  authentication?: any;
  [key: string]: any;
}

export interface PulsarConsumerConfig {
  topic?: string;
  subscription?: string;
  subscriptionType?: 'Exclusive' | 'Shared' | 'Failover' | 'KeyShared';
  ackTimeoutMs?: number;
  nAckRedeliverTimeoutMs?: number;
  receiverQueueSize?: number;
  maxTotalReceiverQueueSizeAcrossPartitions?: number;
  consumerName?: string;
  readCompacted?: boolean;
  initialPosition?: 'Latest' | 'Earliest';
  patternAutoDiscoveryPeriod?: number;
  [key: string]: any;
}

export interface PulsarProducerConfig {
  topic?: string;
  producerName?: string;
  sendTimeoutMs?: number;
  initialSequenceId?: number;
  maxPendingMessages?: number;
  maxPendingMessagesAcrossPartitions?: number;
  blockIfQueueFull?: boolean;
  batchingEnabled?: boolean;
  batchingMaxPublishDelayMs?: number;
  batchingMaxMessages?: number;
  compressionType?: 'LZ4' | 'Zlib' | 'Zstd' | 'Snappy' | 'None';
  [key: string]: any;
}

export interface PulsarReplyConsumerConfig {
  topic?: string;
  subscription?: string;
  subscriptionType?: 'Exclusive' | 'Shared' | 'Failover' | 'KeyShared';
  ackTimeoutMs?: number;
  receiverQueueSize?: number;
  consumerName?: string;
  initialPosition?: 'Latest' | 'Earliest';
  [key: string]: any;
}