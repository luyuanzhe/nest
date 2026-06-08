import { Injectable } from '../decorators/core/injectable.decorator';
import { Optional } from '../decorators/core/optional.decorator';
import { PipeTransform } from '../interfaces/features/pipe-transform.interface';
import { isNil } from '../utils/shared.utils';
import { ParsePipeBase, ParsePipeOptions } from './parse-pipe-base';

export interface ParseDatePipeOptions extends ParsePipeOptions {
  /**
   * Default value for the date
   */
  default?: () => Date;
}

@Injectable()
export class ParseDatePipe
  extends ParsePipeBase<string | number | undefined | null, Date | null | undefined>
  implements PipeTransform<string | number | undefined | null, Date | null | undefined>
{
  constructor(@Optional() protected readonly options: ParseDatePipeOptions = {}) {
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
    if (this.options.optional && isNil(value)) {
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
