type VoidCallback = () => void;
type OnErrorCallback = (error: Error) => void;

export const enum PulsarStatus {
  DISCONNECTED = 'disconnected',
  CONNECTED = 'connected',
}

export const enum PulsarEventsMap {
  ERROR = 'error',
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
}

export type PulsarEvents = {
  error: OnErrorCallback;
  connect: VoidCallback;
  disconnect: VoidCallback;
};
