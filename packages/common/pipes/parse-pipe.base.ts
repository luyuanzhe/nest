import { HttpStatus } from '../enums/http-status.enum';
import {
  ArgumentMetadata,
  PipeTransform,
} from '../interfaces/features/pipe-transform.interface';
import {
  ErrorHttpStatusCode,
  HttpErrorByCode,
} from '../utils/http-error-by-code.util';
import { isNil } from '../utils/shared.utils';

export interface ParsePipeBaseOptions {
  errorHttpStatusCode?: ErrorHttpStatusCode;
  exceptionFactory?: (error: string) => any;
  optional?: boolean;
}

export abstract class ParsePipeBase<T, R = T>
  implements PipeTransform<T, R>
{
  protected exceptionFactory: (error: string) => any;

  constructor(options?: ParsePipeBaseOptions) {
    options = options || {};
    const {
      exceptionFactory,
      errorHttpStatusCode = HttpStatus.BAD_REQUEST,
    } = options;

    this.exceptionFactory =
      exceptionFactory ||
      (error => new HttpErrorByCode[errorHttpStatusCode](error));
  }

  abstract transform(value: T, metadata: ArgumentMetadata): R;

  protected isOptional(value: T, options?: { optional?: boolean}): value is T & (null | undefined) {
    return isNil(value) && !!options?.optional;
  }
}