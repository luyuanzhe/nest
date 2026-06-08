import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { Observable } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { TimeoutError } from 'rxjs';
import { WsTimeoutException } from '../errors/ws-timeout-exception';

export interface WsTimeoutInterceptorOptions {

  /**
   * Timeout duration in milliseconds.
   * @default 5000
   */
  time?: number;

  /**
   * Custom timeout message sent to the client.
   * @default 'WebSocket request timeout'
   */
  message?: string;

  /**
   * Whether to forcibly disconnect the client on timeout.
   * @default false
   */
  disconnectOnTimeout?: boolean;

  /**
   * Whether to emit a custom timeout event before disconnecting.
   * This works with both Socket.io and ws clients.
   * @default false
   */
  emitErrorEvent?: boolean;

  /**
   * The event name used when `emitErrorEvent` is true.
   * @default 'exception'
   */
  errorEventName?: string;
}

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MESSAGE = 'WebSocket request timeout';

@Injectable()
export class WsTimeoutInterceptor implements NestInterceptor {
  private readonly time: number;
  private readonly message: string;
  private readonly disconnectOnTimeout: boolean;
  private readonly emitErrorEvent: boolean;
  private readonly errorEventName: string;

  constructor(options?: WsTimeoutInterceptorOptions) {
    this.time = options?.time ?? DEFAULT_TIMEOUT;
    this.message = options?.message ?? DEFAULT_MESSAGE;
    this.disconnectOnTimeout = options?.disconnectOnTimeout ?? false;
    this.emitErrorEvent = options?.emitErrorEvent ?? false;
    this.errorEventName = options?.errorEventName ?? 'exception';
  }

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> | Promise<Observable<any>> {
    if (context.getType() !== 'ws') {
      return next.handle();
    }

    return next.handle().pipe(
      timeout(this.time),
      catchError((err: unknown) => {
        if (err instanceof TimeoutError) {
          return this.handleTimeout(context);
        }
        throw err;
      }),
    );
  }

  private handleTimeout(context: ExecutionContext): never {
    const wsContext = context.switchToWs();
    const client = wsContext.getClient();
    const pattern = wsContext.getPattern();

    const payload = WsTimeoutException.createTimeoutMessage(
      this.message,
      pattern,
    );

    this.sendTimeoutMessage(client, payload);

    if (this.disconnectOnTimeout) {
      this.disconnectClient(client);
    }

    throw new WsTimeoutException(this.message, pattern);
  }

  private sendTimeoutMessage(client: any, payload: object): void {
    try {
      if (isFunction(client.emit)) {
        client.emit(this.errorEventName, payload);
      } else if (isFunction(client.send)) {
        const wsPayload = {
          event: this.errorEventName,
          data: payload,
        };
        client.send(JSON.stringify(wsPayload));
      }
    } catch {
    }
  }

  private disconnectClient(client: any): void {
    try {
      if (isFunction(client.disconnect)) {
        client.disconnect(true);
      } else if (isFunction(client.terminate)) {
        client.terminate();
      } else if (isFunction(client.close)) {
        client.close();
      }
    } catch {
    }
  }
}