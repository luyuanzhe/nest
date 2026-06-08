import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { WsTimeoutModuleOptions } from './ws-timeout-options.interface';

interface ClientTimeoutState {
  timer: ReturnType<typeof setTimeout>;
  lastActivity: number;
}

@Injectable()
export class WsConnectionTimeoutManager
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WsConnectionTimeoutManager.name);
  private readonly clientTimers = new Map<any, ClientTimeoutState>();
  private defaultTimeoutMs = 0;
  private timeoutMessage = 'Connection idle timeout';
  private applicationConfig: ApplicationConfig | null = null;
  private originalBindClientConnect: Function | null = null;
  private originalBindMessageHandlers: Function | null = null;

  public setApplicationConfig(config: ApplicationConfig): void {
    this.applicationConfig = config;
  }

  public configure(options: {
    timeoutMs?: number;
    timeoutMessage?: string;
  }): void {
    if (options.timeoutMs !== undefined) {
      this.defaultTimeoutMs = options.timeoutMs;
    }
    if (options.timeoutMessage !== undefined) {
      this.timeoutMessage = options.timeoutMessage;
    }
  }

  public onModuleInit(): void {
    if (this.defaultTimeoutMs <= 0 || !this.applicationConfig) {
      return;
    }
    this.patchAdapter();
  }

  public onModuleDestroy(): void {
    for (const [client, state] of this.clientTimers) {
      clearTimeout(state.timer);
      this.clientTimers.delete(client);
    }
  }

  public trackClient(client: any, timeoutMs?: number): void {
    if (!client) {
      return;
    }
    const effectiveTimeout = timeoutMs ?? this.defaultTimeoutMs;
    if (effectiveTimeout <= 0) {
      return;
    }

    this.untrackClient(client);

    const state: ClientTimeoutState = {
      timer: setTimeout(() => this.onClientTimeout(client), effectiveTimeout),
      lastActivity: Date.now(),
    };
    this.clientTimers.set(client, state);
  }

  public untrackClient(client: any): void {
    const state = this.clientTimers.get(client);
    if (state) {
      clearTimeout(state.timer);
      this.clientTimers.delete(client);
    }
  }

  public refreshClient(client: any, timeoutMs?: number): void {
    const effectiveTimeout = timeoutMs ?? this.defaultTimeoutMs;
    if (effectiveTimeout <= 0) {
      return;
    }

    const state = this.clientTimers.get(client);
    if (!state) {
      this.trackClient(client, effectiveTimeout);
      return;
    }

    clearTimeout(state.timer);
    state.lastActivity = Date.now();
    state.timer = setTimeout(
      () => this.onClientTimeout(client),
      effectiveTimeout,
    );
  }

  private onClientTimeout(client: any): void {
    this.clientTimers.delete(client);

    this.logger.warn(
      `Client connection idle timeout exceeded, disconnecting: ${this.getClientId(client)}`,
    );

    this.sendTimeoutMessage(client);

    if (isFunction(client.disconnect)) {
      client.disconnect(true);
    } else if (isFunction(client.close)) {
      client.close();
    } else if (isFunction(client.terminate)) {
      client.terminate();
    }
  }

  private sendTimeoutMessage(client: any): void {
    try {
      if (isFunction(client.emit)) {
        client.emit('exception', {
          status: 'error',
          message: this.timeoutMessage,
        });
      } else if (isFunction(client.send)) {
        client.send(
          JSON.stringify({
            event: 'exception',
            data: { status: 'error', message: this.timeoutMessage },
          }),
        );
      }
    } catch {
      // client may already be closing
    }
  }

  private patchAdapter(): void {
    const adapter = this.applicationConfig!.getIoAdapter();
    if (!adapter) {
      return;
    }

    const manager = this;

    if (isFunction(adapter.bindClientConnect)) {
      this.originalBindClientConnect = adapter.bindClientConnect.bind(adapter);
      adapter.bindClientConnect = function (server: any, callback: Function) {
        const wrappedCallback = (...args: any[]) => {
          const [client] = args;
          if (client) {
            manager.trackClient(client);
            manager.listenClientDisconnect(client);
          }
          callback(...args);
        };
        manager.originalBindClientConnect!.call(
          adapter,
          server,
          wrappedCallback,
        );
      };
    }

    if (isFunction(adapter.bindMessageHandlers)) {
      this.originalBindMessageHandlers =
        adapter.bindMessageHandlers.bind(adapter);
      adapter.bindMessageHandlers = function (
        client: any,
        handlers: any[],
        transform: any,
      ) {
        manager.refreshClient(client);
        const wrappedHandlers = handlers.map(handler => ({
          ...handler,
          callback: (...cbArgs: any[]) => {
            manager.refreshClient(client);
            return handler.callback(...cbArgs);
          },
        }));
        manager.originalBindMessageHandlers!.call(
          adapter,
          client,
          wrappedHandlers,
          transform,
        );
      };
    }
  }

  private listenClientDisconnect(client: any): void {
    const manager = this;
    const cleanup = () => manager.untrackClient(client);

    if (isFunction(client.on)) {
      if (isFunction(client.disconnect)) {
        client.on('disconnect', cleanup);
      } else {
        client.on('close', cleanup);
      }
    }
  }

  private getClientId(client: any): string {
    return client?.id ?? client?.remoteAddress ?? 'unknown';
  }
}
