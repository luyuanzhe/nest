import { WsException } from './ws-exception';

export class WsTimeoutException extends WsException {
  constructor(message: string = 'WebSocket request timed out') {
    super(message);
  }
}
