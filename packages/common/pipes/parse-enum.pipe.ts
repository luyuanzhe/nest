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
export interface ParseEnumPipeOptions extends AbstractParsePipeOptions {}

/**
 * Defines the built-in ParseEnum Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseEnumPipe<T = any> extends AbstractParsePipe<T, T> {
  constructor(
    protected readonly enumType: T,
    @Optional() protected readonly options?: ParseEnumPipeOptions,
  ) {
    super(options);
    if (!enumType) {
      throw new Error(
        `"ParseEnumPipe" requires "enumType" argument specified (to validate input values).`,
      );
    }
  }

  /**
   * Method that accesses and performs optional transformation on argument for
   * in-flight requests.
   *
   * @param value currently processed route argument
   * @param metadata contains metadata about the currently processed route argument
   */
  async transform(value: T, metadata: ArgumentMetadata): Promise<T> {
    if (this.isOptionalAndNil(value)) {
      return value;
    }
    if (!this.isEnum(value)) {
      throw this.exceptionFactory(
        'Validation failed (enum string is expected)',
      );
    }
    return value;
  }

  protected isEnum(value: T): boolean {
    const enumValues = Object.keys(this.enumType as object).map(
      item => this.enumType[item],
    );
    return enumValues.includes(value);
  }
}
