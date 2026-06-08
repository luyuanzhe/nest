import { expect } from 'chai';
import * as sinon from 'sinon';
import { ClientPulsar } from '../../client/client-pulsar';

describe('ClientPulsar', () => {
  let client: ClientPulsar;
  let untypedClient: any;

  beforeEach(() => {
    client = new ClientPulsar({});
    untypedClient = client as any;
  });

  describe('connect', () => {
    it('should create client, reply consumer, and start response loop', async () => {
      const pulsarClient = {
        subscribe: sinon.stub().resolves({}),
      };
      const createClientStub = sinon
        .stub(untypedClient, 'createClient')
        .returns(pulsarClient);
      const consumeResponsesStub = sinon
        .stub(untypedClient, 'consumeResponses')
        .resolves();

      await client.connect();

      expect(createClientStub.calledOnce).to.be.true;
      expect(pulsarClient.subscribe.calledOnce).to.be.true;
      expect(consumeResponsesStub.calledOnce).to.be.true;
      expect(untypedClient.client).to.be.equal(pulsarClient);
      expect(untypedClient.isConnected).to.be.true;

      createClientStub.restore();
      consumeResponsesStub.restore();
    });
  });

  describe('publish', () => {
    it('should normalize pattern, assign packet id, and publish request', async () => {
      const sendPacketStub = sinon.stub(untypedClient, 'sendPacket').resolves();
      sinon.stub(untypedClient, 'assignPacketId').callsFake(packet => ({
        ...packet,
        id: 'packet-id',
      }));

      const dispose = untypedClient.publish(
        {
          pattern: { cmd: 'sum' },
          data: [1, 2, 3],
        },
        sinon.spy(),
      );

      await Promise.resolve();

      expect(sendPacketStub.calledOnce).to.be.true;
      expect(sendPacketStub.firstCall.args[0]).to.include({
        id: 'packet-id',
        pattern: '{"cmd":"sum"}',
      });
      expect(sendPacketStub.firstCall.args[1]).to.deep.equal({
        correlationId: 'packet-id',
        replyTo: untypedClient.replyTopic,
      });
      expect(untypedClient.routingMap.has('packet-id')).to.be.true;

      dispose();
      expect(untypedClient.routingMap.has('packet-id')).to.be.false;
    });
  });

  describe('handleMessage', () => {
    it('should deserialize reply payload and invoke response callback', async () => {
      const callback = sinon.spy();
      await client.handleMessage(
        {
          getData: () => Buffer.from(JSON.stringify({ response: 6 })),
          getProperties: () => ({ correlationId: 'packet-id' }),
          getTopicName: () => 'persistent://public/default/nestjs.__reply__.1',
        },
        callback,
      );

      expect(callback.calledOnce).to.be.true;
      expect(callback.firstCall.args[0]).to.deep.equal({
        err: undefined,
        response: 6,
      });
    });
  });

  describe('consumeResponses', () => {
    it('should route correlated replies to the pending callback', async () => {
      const callback = sinon.spy();
      const message = {
        getData: () => Buffer.from(JSON.stringify({ response: 6, isDisposed: true })),
        getProperties: () => ({ correlationId: 'packet-id' }),
        getTopicName: () => 'persistent://public/default/nestjs.__reply__.1',
      };
      const consumer = {
        receive: sinon.stub().resolves(message),
        acknowledge: sinon.stub().callsFake(() => {
          untypedClient.isClosing = true;
        }),
      };

      untypedClient.consumer = consumer;
      untypedClient.routingMap.set('packet-id', callback);
      await untypedClient.consumeResponses();

      expect(callback.calledOnce).to.be.true;
      expect(consumer.acknowledge.calledOnceWith(message)).to.be.true;
    });
  });

  describe('close', () => {
    it('should close pulsar resources and reject pending requests', async () => {
      const callback = sinon.spy();
      const producer = { close: sinon.stub().resolves() };
      const consumer = { close: sinon.stub().resolves() };
      const pulsarClient = { close: sinon.stub().resolves() };

      untypedClient.producers.set('topic', producer);
      untypedClient.consumer = consumer;
      untypedClient.client = pulsarClient;
      untypedClient.routingMap.set('packet-id', callback);

      await client.close();

      expect(producer.close.calledOnce).to.be.true;
      expect(consumer.close.calledOnce).to.be.true;
      expect(pulsarClient.close.calledOnce).to.be.true;
      expect(callback.calledOnce).to.be.true;
      expect(callback.firstCall.args[0].err.message).to.be.equal(
        'Connection closed',
      );
      expect(untypedClient.routingMap.size).to.be.equal(0);
    });
  });
});
