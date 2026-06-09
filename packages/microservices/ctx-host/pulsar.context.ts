import { BaseRpcContext } from './base-rpc.context';

type PulsarContextArgs = [Record<string, any>, any, string];

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

  getPattern() {
    return this.args[2];
  }
}