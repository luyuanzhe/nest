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
export interface ParsePipeOptions {
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
 * Abstract base class for built-in parse pipes.
 * Provides common validation logic for options, exception handling, and optional value checks.
 *
 * @publicApi
 */
export abstract class ParsePipeBase<TInput = any, TOutput = any>
  implements PipeTransform<TInput, Promise<TOutput> | TOutput>
{
  protected exceptionFactory: (error: string) => any;

  constructor(
    @Optional() protected readonly options?: ParsePipeOptions,
  ) {
    const opts = options || {};
    const {
      exceptionFactory,
      errorHttpStatusCode = HttpStatus.BAD_REQUEST,
    } = opts;

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
  abstract transform(
    value: TInput,
    metadata: ArgumentMetadata,
  ): Promise<TOutput> | TOutput;

  /**
   * Checks if the value is nil and the pipe is optional.
   * Returns the value if both conditions are met, otherwise returns false.
   *
   * @param value currently processed route argument
   * @returns the value if nil and optional, otherwise false
   */
  protected returnIfNil(value: any): any {
    if (isNil(value) && this.options?.optional) {
      return value;
    }
    return false;
  }
}
