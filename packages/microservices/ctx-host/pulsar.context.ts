import { BaseRpcContext } from './base-rpc.context';

type PulsarContextArgs = [
  message: Record<string, any>,
  consumer: any,
  producer: any,
  topic: string,
  pattern: string,
];

export class PulsarContext extends BaseRpcContext<PulsarContextArgs> {
  constructor(args: PulsarContextArgs) {
    super(args);
  }

  getMessage() {
    return this.args[0];
  }

  getConsumer() {
    return this.args[1];
  }

  getProducer() {
    return this.args[2];
  }

  getTopic() {
    return this.args[3];
  }

  getPattern() {
    return this.args[4];
  }
}
