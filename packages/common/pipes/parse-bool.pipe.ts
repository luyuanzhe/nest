import { Injectable } from '../decorators/core/injectable.decorator';
import { Optional } from '../decorators/core/optional.decorator';
import {
  ArgumentMetadata,
  PipeTransform,
} from '../interfaces/features/pipe-transform.interface';
import { ParsePipeBase, ParsePipeOptions } from './parse-pipe-base';

/**
 * @publicApi
 */
export interface ParseBoolPipeOptions extends ParsePipeOptions {}

/**
 * Defines the built-in ParseBool Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseBoolPipe
  extends ParsePipeBase<string | boolean, Promise<boolean>>
  implements PipeTransform<string | boolean, Promise<boolean>>
{
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
  ): Promise<boolean> {
    const nilResult = this.returnIfNil(value);
    if (nilResult !== false) {
      return nilResult;
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
