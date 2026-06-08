import { Injectable } from '@nestjs/common';
import {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common/interfaces';
import { Reflector } from '@nestjs/core';
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { WS_TIMEOUT_METADATA } from '../constants';
import { WsTimeoutException } from './ws-timeout-exception';
import { WsTimeoutModuleOptions } from './ws-timeout-options.interface';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_TIMEOUT_MESSAGE = 'Request timeout';

@Injectable()
export class WsTimeoutInterceptor implements NestInterceptor {
  private readonly defaultTimeoutMs: number;
  private readonly timeoutMessage: string;
  private readonly disconnectOnTimeout: boolean;

  constructor(
    private readonly reflector: Reflector,
    options: WsTimeoutModuleOptions = {},
  ) {
    this.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.timeoutMessage = options.timeoutMessage ?? DEFAULT_TIMEOUT_MESSAGE;
    this.disconnectOnTimeout = options.disconnectOnTimeout ?? true;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'ws') {
      return next.handle();
    }

    const handlerTimeout = this.reflector.get<number>(
      WS_TIMEOUT_METADATA,
      context.getHandler(),
    );
    const timeoutMs = handlerTimeout ?? this.defaultTimeoutMs;

    if (timeoutMs <= 0) {
      return next.handle();
    }

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError(err => {
        if (err instanceof TimeoutError) {
          return this.handleTimeout(context);
        }
        return throwError(() => err);
      }),
    );
  }

  private handleTimeout(context: ExecutionContext): Observable<never> {
    if (this.disconnectOnTimeout) {
      this.disconnectClient(context);
    }
    return throwError(() => new WsTimeoutException(this.timeoutMessage));
  }

  private disconnectClient(context: ExecutionContext): void {
    const client = context.switchToWs().getClient();
    if (!client) {
      return;
    }
    if (isFunction(client.disconnect)) {
      client.disconnect(true);
    } else if (isFunction(client.close)) {
      client.close();
    } else if (isFunction(client.terminate)) {
      client.terminate();
    }
  }
}
