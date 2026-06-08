import { WsException } from '../errors/ws-exception';

export class WsTimeoutException extends WsException {
  constructor(message = 'Request timeout') {
    super(message);
  }
}
