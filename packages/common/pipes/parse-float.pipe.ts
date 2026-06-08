import { Injectable, Optional } from '../decorators/core';
import { ArgumentMetadata } from '../index';
import { ParsePipeBase, ParsePipeOptions } from './parse-pipe-base';

/**
 * @publicApi
 */
export interface ParseFloatPipeOptions extends ParsePipeOptions {}

/**
 * Defines the built-in ParseFloat Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseFloatPipe extends ParsePipeBase<string, number> {
  constructor(@Optional() protected readonly options?: ParseFloatPipeOptions) {
    super(options);
  }

  /**
   * Method that accesses and performs optional transformation on argument for
   * in-flight requests.
   *
   * @param value currently processed route argument
   * @param metadata contains metadata about the currently processed route argument
   */
  async transform(value: string, metadata: ArgumentMetadata): Promise<number> {
    const nilResult = this.returnIfNil(value);
    if (nilResult !== false) {
      return nilResult;
    }
    if (!this.isNumeric(value)) {
      throw this.exceptionFactory(
        'Validation failed (numeric string is expected)',
      );
    }
    return parseFloat(value);
  }

  /**
   * @param value currently processed route argument
   * @returns `true` if `value` is a valid float number
   */
  protected isNumeric(value: string): boolean {
    return (
      ['string', 'number'].includes(typeof value) &&
      !isNaN(parseFloat(value)) &&
      isFinite(value as any)
    );
  }
}
