import { expect } from 'chai';
import { PulsarContext } from '../../ctx-host/pulsar.context';

describe('PulsarContext', () => {
  it('should expose pulsar runtime arguments', () => {
    const message = { id: 'message' };
    const consumer = { id: 'consumer' };
    const producer = { id: 'producer' };
    const topic = 'persistent://public/default/nestjs.test';
    const pattern = '{"cmd":"sum"}';
    const context = new PulsarContext([
      message,
      consumer,
      producer,
      topic,
      pattern,
    ]);

    expect(context.getMessage()).to.be.equal(message);
    expect(context.getConsumer()).to.be.equal(consumer);
    expect(context.getProducer()).to.be.equal(producer);
    expect(context.getTopic()).to.be.equal(topic);
    expect(context.getPattern()).to.be.equal(pattern);
  });
});
