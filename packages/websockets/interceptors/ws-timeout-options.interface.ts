import { ModuleMetadata } from '@nestjs/common';

export interface WsTimeoutModuleOptions {
  timeoutMs?: number;
  connectionTimeoutMs?: number;
  timeoutMessage?: string;
  disconnectOnTimeout?: boolean;
}

export interface WsTimeoutModuleAsyncOptions extends Pick<ModuleMetadata, 'imports' | 'providers'> {
  useFactory: (...args: any[]) => Promise<WsTimeoutModuleOptions> | WsTimeoutModuleOptions;
  inject?: any[];
}
