import { expect } from 'chai';
import * as sinon from 'sinon';
import { NO_MESSAGE_HANDLER } from '../../constants';
import { ServerPulsar } from '../../server/server-pulsar';

describe('ServerPulsar', () => {
  let server: ServerPulsar;
  let untypedServer: any;

  beforeEach(() => {
    server = new ServerPulsar({});
    untypedServer = server as any;
  });

  describe('start', () => {
    it('should create the pulsar client and subscribe to registered patterns', async () => {
      const pulsarClient = {};
      const createClientStub = sinon
        .stub(untypedServer, 'createClient')
        .returns(pulsarClient);
      const createConsumerStub = sinon
        .stub(untypedServer, 'createConsumer')
        .resolves({});
      const consumeMessagesStub = sinon
        .stub(untypedServer, 'consumeMessages')
        .resolves();

      server.addHandler({ cmd: 'sum' }, sinon.stub());
      await server.start();

      expect(createClientStub.calledOnce).to.be.true;
      expect(createConsumerStub.calledOnce).to.be.true;
      expect(consumeMessagesStub.calledOnce).to.be.true;
      expect(untypedServer.client).to.be.equal(pulsarClient);

      createClientStub.restore();
      createConsumerStub.restore();
      consumeMessagesStub.restore();
    });
  });

  describe('handleMessage', () => {
    it('should delegate event packets to the event handler pipeline', async () => {
      const consumer = {
        acknowledge: sinon.stub().resolves(),
      };
      const handleEventStub = sinon.stub(server, 'handleEvent').resolves();
      const getProducerStub = sinon.stub(untypedServer, 'getProducer').resolves({});

      await server.handleMessage(
        {
          getData: () => Buffer.from(JSON.stringify({ pattern: 'notification', data: true })),
          getProperties: () => ({}),
        },
        consumer,
        'persistent://public/default/nestjs.notification',
      );

      expect(handleEventStub.calledOnce).to.be.true;
      expect(consumer.acknowledge.calledOnce).to.be.true;

      handleEventStub.restore();
      getProducerStub.restore();
    });

    it('should respond with NO_MESSAGE_HANDLER when no handler matches', async () => {
      const consumer = {
        acknowledge: sinon.stub().resolves(),
      };
      const sendMessageStub = sinon.stub(untypedServer, 'sendMessage').resolves();
      const getProducerStub = sinon.stub(untypedServer, 'getProducer').resolves({});

      await server.handleMessage(
        {
          getData: () =>
            Buffer.from(
              JSON.stringify({
                id: 'packet-id',
                pattern: '{"cmd":"sum"}',
                data: [1, 2, 3],
              }),
            ),
          getProperties: () => ({
            replyTo: 'persistent://public/default/nestjs.__reply__.1',
            correlationId: 'packet-id',
          }),
        },
        consumer,
        'persistent://public/default/nestjs.%7B%22cmd%22%3A%22sum%22%7D',
      );

      expect(sendMessageStub.calledOnce).to.be.true;
      expect(sendMessageStub.firstCall.args[0]).to.deep.equal({
        id: 'packet-id',
        err: NO_MESSAGE_HANDLER,
        status: 'error',
      });
      expect(consumer.acknowledge.calledOnce).to.be.true;

      sendMessageStub.restore();
      getProducerStub.restore();
    });

    it('should invoke the matching handler and publish the response', async () => {
      const consumer = {
        acknowledge: sinon.stub().resolves(),
      };
      const handler = sinon.stub().resolves(6);
      const sendMessageStub = sinon.stub(untypedServer, 'sendMessage').resolves();
      const sendStub = sinon
        .stub(server, 'send')
        .callsFake((stream$, respond) => {
          respond({ response: 6, isDisposed: true });
          return { add: () => undefined } as any;
        });
      const getProducerStub = sinon.stub(untypedServer, 'getProducer').resolves({});

      server.addHandler({ cmd: 'sum' }, handler as any);
      await server.handleMessage(
        {
          getData: () =>
            Buffer.from(
              JSON.stringify({
                id: 'packet-id',
                pattern: '{"cmd":"sum"}',
                data: [1, 2, 3],
              }),
            ),
          getProperties: () => ({
            replyTo: 'persistent://public/default/nestjs.__reply__.1',
            correlationId: 'packet-id',
          }),
        },
        consumer,
        'persistent://public/default/nestjs.%7B%22cmd%22%3A%22sum%22%7D',
      );

      expect(handler.calledOnceWith([1, 2, 3], sinon.match.any)).to.be.true;
      expect(sendStub.calledOnce).to.be.true;
      expect(sendMessageStub.calledOnce).to.be.true;

      sendMessageStub.restore();
      sendStub.restore();
      getProducerStub.restore();
    });
  });

  describe('close', () => {
    it('should close pulsar consumers, producers, and client', async () => {
      const consumer = { close: sinon.stub().resolves() };
      const producer = { close: sinon.stub().resolves() };
      const pulsarClient = { close: sinon.stub().resolves() };

      untypedServer.consumers.set('topic', consumer);
      untypedServer.producers.set('reply-topic', producer);
      untypedServer.client = pulsarClient;

      await server.close();

      expect(consumer.close.calledOnce).to.be.true;
      expect(producer.close.calledOnce).to.be.true;
      expect(pulsarClient.close.calledOnce).to.be.true;
      expect(untypedServer.consumers.size).to.be.equal(0);
      expect(untypedServer.producers.size).to.be.equal(0);
    });
  });
});
