export interface PulsarRecordOptions {
  properties?: Record<string, string>;
  eventTimestamp?: number;
  sequenceId?: number;
  partitionKey?: string;
  orderingKey?: string;
  replicationClusters?: string[];
  disableReplication?: boolean;
  deliverAt?: number;
}

export class PulsarRecord<TData = any> {
  constructor(
    public readonly data: TData,
    public options?: PulsarRecordOptions,
  ) {}
}

export class PulsarRecordBuilder<TData> {
  private options?: PulsarRecordOptions;

  constructor(private data?: TData) {}

  public setOptions(options: PulsarRecordOptions): this {
    this.options = options;
    return this;
  }

  public setData(data: TData): this {
    this.data = data;
    return this;
  }

  public build(): PulsarRecord {
    return new PulsarRecord(this.data!, this.options);
  }
}
