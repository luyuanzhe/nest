import { Injectable } from '../decorators/core/injectable.decorator';
import { Optional } from '../decorators/core/optional.decorator';
import { ArgumentMetadata } from '../interfaces/features/pipe-transform.interface';
import {
  AbstractParsePipe,
  AbstractParsePipeOptions,
} from './abstract-parse.pipe';

/**
 * @publicApi
 */
export interface ParseBoolPipeOptions extends AbstractParsePipeOptions {}

/**
 * Defines the built-in ParseBool Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseBoolPipe extends AbstractParsePipe<
  string | boolean,
  boolean
> {
  constructor(@Optional() protected readonly options?: ParseBoolPipeOptions) {
    super(options);
  }

  /**
   * Method that accesses and performs optional transformation on argument for
   * in-flight requests.
   *
   * @param value currently processed route argument
   * @param metadata contains metadata about the currently processed route argument
   */
  async transform(
    value: string | boolean,
    metadata: ArgumentMetadata,
  ): Promise<boolean | string> {
    if (this.isOptionalAndNil(value)) {
      return value;
    }
    if (this.isTrue(value)) {
      return true;
    }
    if (this.isFalse(value)) {
      return false;
    }
    throw this.exceptionFactory(
      'Validation failed (boolean string is expected)',
    );
  }

  /**
   * @param value currently processed route argument
   * @returns `true` if `value` is said 'true', ie., if it is equal to the boolean
   * `true` or the string `"true"`
   */
  protected isTrue(value: string | boolean): boolean {
    return value === true || value === 'true';
  }

  /**
   * @param value currently processed route argument
   * @returns `true` if `value` is said 'false', ie., if it is equal to the boolean
   * `false` or the string `"false"`
   */
  protected isFalse(value: string | boolean): boolean {
    return value === false || value === 'false';
  }
}
