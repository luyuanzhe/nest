import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { WsException } from '../errors/ws-exception';

export interface WsTimeoutInterceptorOptions {
  /**
   * Timeout in milliseconds.
   * @default 5000
   */
  timeout?: number;
  /**
   * Custom error message or payload to send to the client before disconnecting.
   * @default 'Message processing timeout'
   */
  errorMessage?: string | Record<string, any>;
}

/**
 * Global WebSocket Timeout Interceptor
 * 
 * Intercepts WebSocket message handling and applies a timeout.
 * If the execution takes longer than the specified timeout, it actively disconnects
 * the client and sends an exception message.
 * 
 * Compatible with both Socket.io and native ws adapters.
 */
@Injectable()
export class WsTimeoutInterceptor implements NestInterceptor {
  constructor(private readonly options: WsTimeoutInterceptorOptions = {}) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const timeoutMillis = this.options.timeout || 5000;
    const errorMessage = this.options.errorMessage || 'Message processing timeout';

    return next.handle().pipe(
      timeout(timeoutMillis),
      catchError(err => {
        if (err instanceof TimeoutError) {
          const client = context.switchToWs().getClient();
          
          const payload = typeof errorMessage === 'string' 
            ? { status: 'error', message: errorMessage }
            : errorMessage;

          // Socket.io compatibility
          if (typeof client.disconnect === 'function') {
            if (typeof client.emit === 'function') {
              try {
                client.emit('exception', payload);
              } catch {}
            }
            client.disconnect(true);
          } 
          // ws compatibility
          else if (typeof client.close === 'function') {
            if (typeof client.send === 'function') {
              try {
                client.send(
                  JSON.stringify({
                    event: 'exception',
                    data: payload,
                  }),
                );
              } catch {}
            }
            client.close();
          }

          return throwError(() => new WsException(errorMessage));
        }
        return throwError(() => err);
      }),
    );
  }
}
