type VoidCallback = () => void;
type OnErrorCallback = (error: Error) => void;

export const enum PulsarStatus {
  DISCONNECTED = 'disconnected',
  CONNECTED = 'connected',
  CLOSED = 'closed',
}

export const enum PulsarEventsMap {
  ERROR = 'error',
  CONNECT = 'connect',
  CLOSE = 'close',
}

export type PulsarEvents = {
  error: OnErrorCallback;
  connect: VoidCallback;
  close: VoidCallback;
};