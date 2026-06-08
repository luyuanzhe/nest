import { WsException } from './ws-exception';

export class WsTimeoutException extends WsException {
  public readonly pattern: string;

  constructor(
    error: string | object,
    pattern?: string,
  ) {
    super(error);
    this.pattern = pattern ?? 'unknown';
    this.name = 'WsTimeoutException';
  }

  public static createTimeoutMessage(
    defaultMessage: string,
    pattern: string,
  ): object {
    return {
      status: 'error',
      message: defaultMessage,
      event: pattern,
      timestamp: new Date().toISOString(),
    };
  }
}