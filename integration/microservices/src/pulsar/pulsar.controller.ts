import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import {
  ClientProxy,
  ClientProxyFactory,
  MessagePattern,
  Transport,
} from '@nestjs/microservices';
import { Observable } from 'rxjs';

@Controller()
export class PulsarController {
  client: ClientProxy;

  constructor() {
    this.client = ClientProxyFactory.create({
      transport: Transport.PULSAR,
      options: {
        client: {
          serviceUrl: 'pulsar://localhost:6650',
        },
      },
    });
  }

  @Post()
  @HttpCode(200)
  call(@Query('command') cmd: string, @Body() data: number[]): Observable<number> {
    return this.client.send<number>(cmd, data);
  }

  @MessagePattern('sum')
  sum(data: number[]): number {
    return (data || []).reduce((a, b) => a + b);
  }

  @MessagePattern('asyncSum')
  async asyncSum(data: number[]): Promise<number> {
    return (data || []).reduce((a, b) => a + b);
  }
}
