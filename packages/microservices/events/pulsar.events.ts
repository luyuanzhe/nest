type VoidCallback = () => void;
type OnErrorCallback = (error: Error) => void;

export const enum PulsarStatus {
  DISCONNECTED = 'disconnected',
  CONNECTED = 'connected',
}

export const enum PulsarEventsMap {
  ERROR = 'error',
  DISCONNECT = 'disconnect',
  CONNECT = 'connect',
}

export type PulsarEvents = {
  error: OnErrorCallback;
  disconnect: VoidCallback;
  connect: VoidCallback;
};
