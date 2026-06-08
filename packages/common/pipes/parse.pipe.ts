import { HttpStatus } from '../enums/http-status.enum';
import {
  ErrorHttpStatusCode,
  HttpErrorByCode,
} from '../utils/http-error-by-code.util';
import { isNil } from '../utils/shared.utils';

export abstract class ParsePipe<
  TOptions extends {
    exceptionFactory?: (error: any) => any;
    errorHttpStatusCode?: ErrorHttpStatusCode;
    optional?: boolean;
  },
> {
  protected exceptionFactory: (error: any) => any;
  protected readonly options: TOptions;

  protected constructor(options?: TOptions) {
    this.options = (options || {}) as TOptions;

    const {
      exceptionFactory,
      errorHttpStatusCode = HttpStatus.BAD_REQUEST,
    } = this.options;

    this.exceptionFactory =
      exceptionFactory ||
      (error => new HttpErrorByCode[errorHttpStatusCode](error));
  }

  protected isOptionallyNil(value: unknown): boolean {
    return isNil(value) && this.options.optional === true;
  }

  protected getOptionalValue<TResult>(value: unknown): TResult {
    return value as TResult;
  }
}
