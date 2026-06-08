import { Injectable } from '../decorators/core/injectable.decorator';
import { PipeTransform } from '../interfaces/features/pipe-transform.interface';
import { ErrorHttpStatusCode } from '../utils/http-error-by-code.util';
import { isNil } from '../utils/shared.utils';
import { ParsePipe } from './parse.pipe';

export interface ParseDatePipeOptions {
  /**
   * If true, the pipe will return null or undefined if the value is not provided
   * @default false
   */
  optional?: boolean;
  /**
   * Default value for the date
   */
  default?: () => Date;
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
}

@Injectable()
export class ParseDatePipe
  extends ParsePipe<ParseDatePipeOptions>
  implements PipeTransform<string | number | undefined | null>
{
  constructor(options: ParseDatePipeOptions = {}) {
    super(options);
  }

  /**
   * Method that accesses and performs optional transformation on argument for
   * in-flight requests.
   *
   * @param value currently processed route argument
   * @param metadata contains metadata about the currently processed route argument
   */
  transform(
    value: string | number | undefined | null,
  ): Date | null | undefined {
    if (this.isOptionallyNil(value)) {
      return this.options.default ? this.options.default() : (value as null | undefined);
    }

    if (isNil(value) || value === '') {
      throw this.exceptionFactory('Validation failed (no Date provided)');
    }

    const transformedValue = new Date(value);

    if (isNaN(transformedValue.getTime())) {
      throw this.exceptionFactory('Validation failed (invalid date format)');
    }

    return transformedValue;
  }
}
