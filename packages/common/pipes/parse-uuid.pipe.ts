import { Injectable } from '../decorators/core/injectable.decorator';
import { Optional } from '../decorators/core/optional.decorator';
import {
  ArgumentMetadata,
} from '../interfaces/features/pipe-transform.interface';
import { isString } from '../utils/shared.utils';
import { ParsePipeBase, ParsePipeBaseOptions } from './parse-pipe.base';

/**
 * @publicApi
 */
export interface ParseUUIDPipeOptions extends ParsePipeBaseOptions {
  /**
   * UUID version to validate
   */
  version?: '3' | '4' | '5' | '7';
}

/**
 * Defines the built-in ParseUUID Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
@Injectable()
export class ParseUUIDPipe extends ParsePipeBase<string, Promise<string>> {
  protected static uuidRegExps = {
    3: /^[0-9A-F]{8}-[0-9A-F]{4}-3[0-9A-F]{3}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
    4: /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    5: /^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    7: /^[0-9A-F]{8}-[0-9A-F]{4}-7[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
    all: /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
  };
  private readonly version: '3' | '4' | '5' | '7' | undefined;

  constructor(@Optional() protected readonly options?: ParseUUIDPipeOptions) {
    super(options);
    this.version = options?.version;
  }

  async transform(value: string, metadata: ArgumentMetadata): Promise<string> {
    if (this.isOptional(value, this.options)) {
      return value;
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
