import { DynamicModule, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { WsConnectionTimeoutManager } from './ws-connection-timeout-manager';
import { WsTimeoutInterceptor } from './ws-timeout.interceptor';
import { WsTimeoutModuleAsyncOptions, WsTimeoutModuleOptions } from './ws-timeout-options.interface';

export const WS_TIMEOUT_MODULE_OPTIONS = 'WS_TIMEOUT_MODULE_OPTIONS';

export class WsTimeoutModule {
  public static forRoot(options: WsTimeoutModuleOptions = {}): DynamicModule {
    const optionsProvider: Provider = {
      provide: WS_TIMEOUT_MODULE_OPTIONS,
      useValue: options,
    };

    const interceptorProvider: Provider = {
      provide: APP_INTERCEPTOR,
      useFactory: (reflector: Reflector, moduleOptions: WsTimeoutModuleOptions) => {
        return new WsTimeoutInterceptor(reflector, moduleOptions);
      },
      inject: [Reflector, WS_TIMEOUT_MODULE_OPTIONS],
    };

    const connectionTimeoutManagerProvider: Provider = {
      provide: WsConnectionTimeoutManager,
      useFactory: (applicationConfig: ApplicationConfig, moduleOptions: WsTimeoutModuleOptions) => {
        const manager = new WsConnectionTimeoutManager();
        manager.setApplicationConfig(applicationConfig);
        manager.configure({
          timeoutMs: moduleOptions.connectionTimeoutMs,
          timeoutMessage: moduleOptions.timeoutMessage,
        });
        return manager;
      },
      inject: [ApplicationConfig, WS_TIMEOUT_MODULE_OPTIONS],
    };

    return {
      module: WsTimeoutModule,
      global: true,
      providers: [
        optionsProvider,
        interceptorProvider,
        connectionTimeoutManagerProvider,
      ],
      exports: [WsConnectionTimeoutManager, WS_TIMEOUT_MODULE_OPTIONS],
    };
  }

  public static forRootAsync(
    options: WsTimeoutModuleAsyncOptions,
  ): DynamicModule {
    const optionsProvider: Provider = {
      provide: WS_TIMEOUT_MODULE_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    const interceptorProvider: Provider = {
      provide: APP_INTERCEPTOR,
      useFactory: (reflector: Reflector, moduleOptions: WsTimeoutModuleOptions) => {
        return new WsTimeoutInterceptor(reflector, moduleOptions);
      },
      inject: [Reflector, WS_TIMEOUT_MODULE_OPTIONS],
    };

    const connectionTimeoutManagerProvider: Provider = {
      provide: WsConnectionTimeoutManager,
      useFactory: (applicationConfig: ApplicationConfig, moduleOptions: WsTimeoutModuleOptions) => {
        const manager = new WsConnectionTimeoutManager();
        manager.setApplicationConfig(applicationConfig);
        manager.configure({
          timeoutMs: moduleOptions.connectionTimeoutMs,
          timeoutMessage: moduleOptions.timeoutMessage,
        });
        return manager;
      },
      inject: [ApplicationConfig, WS_TIMEOUT_MODULE_OPTIONS],
    };

    return {
      module: WsTimeoutModule,
      global: true,
      providers: [
        optionsProvider,
        interceptorProvider,
        connectionTimeoutManagerProvider,
        ...(options.providers || []),
      ],
      imports: options.imports || [],
      exports: [WsConnectionTimeoutManager, WS_TIMEOUT_MODULE_OPTIONS],
    };
  }
}
