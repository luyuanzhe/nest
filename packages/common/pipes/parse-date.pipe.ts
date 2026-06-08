import { Injectable } from '../decorators/core/injectable.decorator';
import { ArgumentMetadata } from '../interfaces/features/pipe-transform.interface';
import { isNil } from '../utils/shared.utils';
import {
  AbstractParsePipe,
  AbstractParsePipeOptions,
} from './abstract-parse.pipe';

export interface ParseDatePipeOptions extends AbstractParsePipeOptions {
  /**
   * Default value for the date
   */
  default?: () => Date;
}

@Injectable()
export class ParseDatePipe extends AbstractParsePipe<
  string | number | undefined | null,
  Date
> {
  constructor(private readonly options: ParseDatePipeOptions = {}) {
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
    value: string | number | undefined | null,
    metadata: ArgumentMetadata,
  ): Promise<Date | null | undefined> {
    if (this.isOptionalAndNil(value)) {
      return this.options.default ? this.options.default() : value;
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
