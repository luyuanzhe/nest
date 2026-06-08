import { Injectable } from '../decorators/core/injectable.decorator';
import { Optional } from '../decorators/core/optional.decorator';
import { ArgumentMetadata } from '../interfaces/features/pipe-transform.interface';
import { isFinite } from '../utils/shared.utils';
import {
  AbstractParsePipe,
  AbstractParsePipeOptions,
} from './abstract-parse.pipe';

/**
 * @publicApi
 */
export interface ParseFloatPipeOptions extends AbstractParsePipeOptions {}

/**
 * Defines the built-in ParseFloat Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseFloatPipe extends AbstractParsePipe<string, number> {
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
  async transform(value: string, metadata: ArgumentMetadata): Promise<number | string> {
    if (this.isOptionalAndNil(value)) {
      return value;
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
