import { NestContainer } from '@nestjs/core';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { Observable } from 'rxjs';
import { GraphInspector } from '../../core/inspector/graph-inspector';
import { AbstractWsAdapter } from '../adapters/ws-adapter';
import { WsContextCreator } from '../context/ws-context-creator';
import { WsTimeoutInterceptor } from '../interceptors';
import { SocketServerProvider } from '../socket-server-provider';
import { WebSocketsController } from '../web-sockets-controller';

class NoopAdapter extends AbstractWsAdapter {
  public create(port: number, options?: any) {}
  public bindMessageHandlers(
    client: any,
    handlers: any,
    transform: (data: any) => Observable<any>,
  ) {}
}

describe('WebSocketsController timeout integration', () => {
  let instance: WebSocketsController;
  let config: ApplicationConfig;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
    });

    config = new ApplicationConfig(new NoopAdapter());
    const provider = new SocketServerProvider(null!, config);
    const graphInspector = new GraphInspector(new NestContainer());
    const contextCreator = sinon.createStubInstance(WsContextCreator);

    instance = new WebSocketsController(
      provider,
      config,
      contextCreator as any,
      graphInspector,
    );
  });

  afterEach(() => {
    clock.restore();
  });

  it('should return the last registered global ws timeout interceptor', () => {
    const firstInterceptor = new WsTimeoutInterceptor({ connectionTimeout: 50 });
    const secondInterceptor = new WsTimeoutInterceptor({ connectionTimeout: 100 });

    config.useGlobalInterceptors(firstInterceptor, secondInterceptor);

    expect(instance.getGlobalWsTimeoutInterceptor()).to.equal(secondInterceptor);
  });

  it('should trigger timeout handling for pending connection hooks', async () => {
    const interceptor = new WsTimeoutInterceptor({
      connectionTimeout: 100,
      response: 'Connection timeout',
    });
    const handleTimeout = sinon.spy(interceptor, 'handleTimeout');
    const gateway = {
      handleConnection: sinon.stub().returns(new Promise(() => undefined)),
    };
    const client = {};

    instance.handleConnection(gateway as any, [client], interceptor);
    await clock.tickAsync(101);

    expect(handleTimeout.calledOnceWithExactly(client)).to.be.true;
  });

  it('should clear the timeout after the connection hook resolves', async () => {
    const interceptor = new WsTimeoutInterceptor({
      connectionTimeout: 100,
      response: 'Connection timeout',
    });
    const handleTimeout = sinon.spy(interceptor, 'handleTimeout');
    const gateway = {
      handleConnection: sinon.stub().resolves(undefined),
    };
    const client = {};

    instance.handleConnection(gateway as any, [client], interceptor);
    await Promise.resolve();
    await clock.tickAsync(101);

    expect(handleTimeout.called).to.be.false;
  });
});
