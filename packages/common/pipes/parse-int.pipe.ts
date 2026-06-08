import { Injectable } from '../decorators/core/injectable.decorator';
import { Optional } from '../decorators/core/optional.decorator';
import { ArgumentMetadata } from '../interfaces/features/pipe-transform.interface';
import { ParsePipeBase, ParsePipeBaseOptions } from './parse-pipe.base';

/**
 * @publicApi
 */
export interface ParseIntPipeOptions extends ParsePipeBaseOptions {}

/**
 * Defines the built-in ParseInt Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseIntPipe extends ParsePipeBase<string, Promise<number>> {
  constructor(@Optional() protected readonly options?: ParseIntPipeOptions) {
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
    if (this.isOptional(value, this.options)) {
      return value;
    }
    if (!this.isNumeric(value)) {
      throw this.exceptionFactory(
        'Validation failed (numeric string is expected)',
      );
    }
    return parseInt(value, 10);
  }

  /**
   * @param value currently processed route argument
   * @returns `true` if `value` is a valid integer number
   */
  protected isNumeric(value: string): boolean {
    return (
      ['string', 'number'].includes(typeof value) &&
      /^-?\d+$/.test(value) &&
      isFinite(value as any)
    );
  }
}
