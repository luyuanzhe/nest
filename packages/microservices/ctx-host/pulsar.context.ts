import { Consumer, Message, Producer } from '../external/pulsar.interface';
import { BaseRpcContext } from './base-rpc.context';

type PulsarContextArgs = [
  message: Message,
  topic: string,
  consumer: Consumer,
  producer: Producer,
];

/**
 * @publicApi
 */
export class PulsarContext extends BaseRpcContext<PulsarContextArgs> {
  constructor(args: PulsarContextArgs) {
    super(args);
  }

  /**
   * Returns the reference to the original message.
   */
  getMessage() {
    return this.args[0];
  }

  /**
   * Returns the name of the topic.
   */
  getTopic() {
    return this.args[1];
  }

  /**
   * Returns the Pulsar consumer reference.
   */
  getConsumer() {
    return this.args[2];
  }

  /**
   * Returns the Pulsar producer reference.
   */
  getProducer() {
    return this.args[3];
  }
}
