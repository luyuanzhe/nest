import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { WsTimeoutException } from '../errors/ws-timeout.exception';

@Injectable()
export class WsTimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutDuration: number = 5000) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.timeoutDuration),
      catchError(err => {
        if (err instanceof TimeoutError) {
          return throwError(() => new WsTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  }
}
