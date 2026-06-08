import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import {
  isFunction,
  isNil,
  isObject,
  isString,
} from '@nestjs/common/utils/shared.utils';
import { EMPTY, Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';

export interface WsTimeoutInterceptorOptions {
  timeout?: number;
  connectionTimeout?: number;
  messageTimeout?: number;
  response?: string | Record<string, any>;
  closeCode?: number;
  closeReason?: string;
}

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_CLOSE_CODE = 1013;
const DEFAULT_TIMEOUT_MESSAGE = 'WebSocket request timeout';

@Injectable()
export class WsTimeoutInterceptor implements NestInterceptor {
  constructor(
    private readonly options: WsTimeoutInterceptorOptions = {},
  ) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    if (context.getType<'ws' | string>() !== 'ws') {
      return next.handle();
    }

    const timeoutMs = this.getMessageTimeout();
    if (isNil(timeoutMs) || timeoutMs <= 0) {
      return next.handle();
    }

    const client = context.switchToWs().getClient();
    return next.handle().pipe(
      timeout({
        each: timeoutMs,
        with: () => {
          this.handleTimeout(client);
          return EMPTY;
        },
      }),
    );
  }

  public getConnectionTimeout(): number | undefined {
    const timeoutMs =
      this.options.connectionTimeout ??
      this.options.timeout ??
      DEFAULT_TIMEOUT;

    return timeoutMs > 0 ? timeoutMs : undefined;
  }

  public handleTimeout(client: any) {
    if (!client) {
      return;
    }

    const payload = this.getTimeoutPayload();

    if (this.isSocketIoClient(client)) {
      if (client.connected === false || client.disconnected === true) {
        return;
      }

      client.emit('exception', payload);
      client.disconnect(true);
      return;
    }

    if (!this.isNativeWsClient(client)) {
      return;
    }

    if (!this.isNativeWsClientOpen(client)) {
      return;
    }

    client.send(
      JSON.stringify({
        event: 'exception',
        data: payload,
      }),
    );
    client.close(this.getCloseCode(), this.getCloseReason());
  }

  protected getMessageTimeout(): number | undefined {
    const timeoutMs =
      this.options.messageTimeout ?? this.options.timeout ?? DEFAULT_TIMEOUT;

    return timeoutMs > 0 ? timeoutMs : undefined;
  }

  protected getTimeoutPayload() {
    const response = this.options.response ?? DEFAULT_TIMEOUT_MESSAGE;

    if (isObject(response)) {
      return response;
    }

    return {
      status: 'error' as const,
      message: isString(response) ? response : DEFAULT_TIMEOUT_MESSAGE,
    };
  }

  protected getCloseCode() {
    return this.options.closeCode ?? DEFAULT_CLOSE_CODE;
  }

  protected getCloseReason() {
    const closeReason = this.options.closeReason;
    if (!isNil(closeReason)) {
      return closeReason;
    }

    const response = this.options.response;
    return isString(response) ? response : DEFAULT_TIMEOUT_MESSAGE;
  }

  protected isSocketIoClient(client: any): boolean {
    return isFunction(client?.emit) && isFunction(client?.disconnect);
  }

  protected isNativeWsClient(client: any): boolean {
    return isFunction(client?.send) && isFunction(client?.close);
  }

  protected isNativeWsClientOpen(client: any): boolean {
    if (isNil(client.readyState)) {
      return true;
    }

    return client.readyState === (client.OPEN ?? 1);
  }
}
