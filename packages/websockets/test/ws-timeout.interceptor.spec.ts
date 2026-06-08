import { expect } from 'chai';
import { NEVER } from 'rxjs';
import * as sinon from 'sinon';
import { ExecutionContextHost } from '../../core/helpers/execution-context-host';
import { WsTimeoutInterceptor } from '../interceptors';

describe('WsTimeoutInterceptor', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
    });
  });

  afterEach(() => {
    clock.restore();
  });

  it('should disconnect socket.io clients when a message handler times out', async () => {
    const emit = sinon.spy();
    const disconnect = sinon.spy();
    const client = {
      emit,
      disconnect,
      connected: true,
      disconnected: false,
    };
    const context = new ExecutionContextHost([client]);
    context.setType('ws');

    const interceptor = new WsTimeoutInterceptor({
      messageTimeout: 100,
      response: 'Message timeout',
    });

    interceptor
      .intercept(context as any, { handle: () => NEVER } as any)
      .subscribe();

    await clock.tickAsync(101);

    expect(
      emit.calledWith('exception', {
        status: 'error',
        message: 'Message timeout',
      }),
    ).to.be.true;
    expect(disconnect.calledWith(true)).to.be.true;
  });

  it('should send an exception payload and close native ws clients on timeout', async () => {
    const send = sinon.spy();
    const close = sinon.spy();
    const client = {
      send,
      close,
      readyState: 1,
      OPEN: 1,
    };
    const context = new ExecutionContextHost([client]);
    context.setType('ws');

    const interceptor = new WsTimeoutInterceptor({
      messageTimeout: 100,
      response: 'Message timeout',
    });

    interceptor
      .intercept(context as any, { handle: () => NEVER } as any)
      .subscribe();

    await clock.tickAsync(101);

    expect(
      send.calledWith(
        JSON.stringify({
          event: 'exception',
          data: {
            status: 'error',
            message: 'Message timeout',
          },
        }),
      ),
    ).to.be.true;
    expect(close.calledWith(1013, 'Message timeout')).to.be.true;
  });
});
