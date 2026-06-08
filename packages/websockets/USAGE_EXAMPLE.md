# WebSocket 超时拦截器使用示例

## 概述

新增的 `WsTimeoutInterceptor` 允许您为 WebSocket 消息处理设置全局超时限制。该拦截器兼容 Socket.io 和原生 WebSocket 两种适配器。

## 快速开始

### 1. 全局超时拦截器配置

在您的 Nest 应用模块中，将 `WsTimeoutInterceptor` 注册为全局拦截器：

```typescript
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { WsTimeoutInterceptor } from '@nestjs/websockets';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useValue: new WsTimeoutInterceptor(10000), // 设置 10 秒超时
    },
  ],
})
export class AppModule {}
```

### 2. 在特定网关上使用

如果您只想要在特定网关使用，可以使用 `@UseInterceptors` 装饰器：

```typescript
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  UseInterceptors,
} from '@nestjs/websockets';
import { WsTimeoutInterceptor } from '@nestjs/websockets';

@WebSocketGateway()
@UseInterceptors(new WsTimeoutInterceptor(5000)) // 5 秒超时
export class EventsGateway {
  @SubscribeMessage('events')
  handleEvent(@MessageBody() data: any, @ConnectedSocket() client: any) {
    // 您的处理逻辑
    return { event: 'events', data: 'Hello World' };
  }
}
```

### 3. 自定义超时提示消息

您可以通过自定义超时异常的消息，或者使用自定义的错误处理器：

```typescript
import { Catch } from '@nestjs/common';
import { WsExceptionFilter, BaseWsExceptionFilter } from '@nestjs/websockets';
import { WsTimeoutException } from '@nestjs/websockets';

@Catch(WsTimeoutException)
export class WsTimeoutExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: WsTimeoutException, host: any) {
    const client = host.switchToWs().getClient();
    client.emit('error', {
      message: '请求超时，请重试',
      code: 'TIMEOUT_ERROR',
    });
    // 也可以选择主动断开连接
    // client.disconnect();
  }
}
```

### 4. 超时后主动断开连接

如果您想在超时后主动断开连接，可以在自定义异常过滤器中实现：

```typescript
import { Catch } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common/interfaces';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { WsTimeoutException } from '@nestjs/websockets';

@Catch(WsTimeoutException)
export class WsTimeoutExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: WsTimeoutException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient();
    client.emit('error', {
      message: '连接超时，即将断开',
      code: 'TIMEOUT_ERROR',
    });
    setTimeout(() => {
      if (client.disconnect) {
        client.disconnect(); // Socket.io
      } else if (client.close) {
        client.close(); // 原生 WebSocket
      }
    }, 100);
  }
}
```

## 配置选项

- `timeoutDuration` (毫秒): 超时时间，默认为 5000ms (5秒)

## 完整示例：网关应用

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { WsTimeoutInterceptor, WsTimeoutExceptionFilter } from '@nestjs/websockets';
import { EventsGateway } from './events.gateway';

@Module({
  providers: [
    EventsGateway,
    {
      provide: APP_INTERCEPTOR,
      useValue: new WsTimeoutInterceptor(8000), // 8秒超时
    },
    {
      provide: APP_FILTER,
      useClass: WsTimeoutExceptionFilter,
    },
  ],
})
export class AppModule {}

// events.gateway.ts
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';

@WebSocketGateway()
export class EventsGateway {
  @SubscribeMessage('slow-operation')
  async handleSlowOperation(@MessageBody() data: any) {
    // 模拟耗时操作
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10秒，超过8秒超时
    return { event: 'result', data: '操作完成' };
  }
}
```
