import { Injectable } from '../decorators/core/injectable.decorator';
import { Optional } from '../decorators/core/optional.decorator';
import {
  ArgumentMetadata,
  PipeTransform,
} from '../interfaces/features/pipe-transform.interface';
import { ErrorHttpStatusCode } from '../utils/http-error-by-code.util';
import { isString } from '../utils/shared.utils';
import { ParsePipe } from './parse.pipe';

/**
 * @publicApi
 */
export interface ParseUUIDPipeOptions {
  /**
   * UUID version to validate
   */
  version?: '3' | '4' | '5' | '7';
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
  exceptionFactory?: (errors: string) => any;
  /**
   * If true, the pipe will return null or undefined if the value is not provided
   * @default false
   */
  optional?: boolean;
}

/**
 * Defines the built-in ParseUUID Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseUUIDPipe
  extends ParsePipe<ParseUUIDPipeOptions>
  implements PipeTransform<string>
{
  protected static uuidRegExps = {
    3: /^[0-9A-F]{8}-[0-9A-F]{4}-3[0-9A-F]{3}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
    4: /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    5: /^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    7: /^[0-9A-F]{8}-[0-9A-F]{4}-7[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    all: /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
  };
  private readonly version: '3' | '4' | '5' | '7' | undefined;

  constructor(@Optional() options?: ParseUUIDPipeOptions) {
    super(options);
    this.version = this.options.version;
  }

  async transform(value: string, metadata: ArgumentMetadata): Promise<string> {
    if (this.isOptionallyNil(value)) {
      return this.getOptionalValue<string>(value);
    }
    if (!this.isUUID(value, this.version)) {
      throw this.exceptionFactory(
        `Validation failed (uuid${
          this.version ? ` v ${this.version}` : ''
        } is expected)`,
      );
    }
    return value;
  }

  protected isUUID(str: unknown, version = 'all') {
    if (!isString(str)) {
      throw this.exceptionFactory('The value passed as UUID is not a string');
    }
    const pattern = ParseUUIDPipe.uuidRegExps[version];
    return pattern?.test(str);
  }
}
