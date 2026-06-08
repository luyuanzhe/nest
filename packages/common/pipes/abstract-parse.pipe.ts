import { Optional } from '../decorators/core/optional.decorator';
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

/**
 * @publicApi
 */
export interface AbstractParsePipeOptions {
  /**
   * The HTTP status code to be used in the response when the validation fails.
   */
  errorHttpStatusCode?: ErrorHttpStatusCode;
  /**
   * A factory function that returns an exception object to be thrown
   * if validation fails.
   * @param error Error message
   * @returns The exception object
   */
  exceptionFactory?: (error: string) => any;
  /**
   * If true, the pipe will return null or undefined if the value is not provided
   * @default false
   */
  optional?: boolean;
}

/**
 * @publicApi
 */
export abstract class AbstractParsePipe<TInput = any, TOutput = any>
  implements PipeTransform<TInput, TOutput | TInput>
{
  protected exceptionFactory: (error: string) => any;

  constructor(@Optional() protected readonly options?: AbstractParsePipeOptions) {
    options = options || {};
    const { exceptionFactory, errorHttpStatusCode = HttpStatus.BAD_REQUEST } =
      options;

    this.exceptionFactory =
      exceptionFactory ||
      (error => new HttpErrorByCode[errorHttpStatusCode](error));
  }

  /**
   * Method that accesses and performs optional transformation on argument for
   * in-flight requests.
   *
   * @param value currently processed route argument
   * @param metadata contains metadata about the currently processed route argument
   */
  abstract transform(value: TInput, metadata: ArgumentMetadata): Promise<TOutput | TInput>;

  /**
   * Check if value is nil and optional is true
   * @param value currently processed route argument
   * @returns true if value is nil and optional is true
   */
  protected isOptionalAndNil(value: any): boolean {
    return isNil(value) && this.options?.optional;
  }
}
