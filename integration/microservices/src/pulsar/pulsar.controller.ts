import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  Client,
  ClientProxy,
  Ctx,
  MessagePattern,
  Payload,
  PulsarContext,
  Transport,
} from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Controller()
export class PulsarController {
  @Client({
    transport: Transport.PULSAR,
    options: {
      client: {
        serviceUrl: 'pulsar://localhost:6650',
      },
    },
  })
  client: ClientProxy;

  @Post('mathSumPulsarMessage')
  @HttpCode(200)
  async call(@Body() data: number[]): Promise<string> {
    await this.client.connect();
    const result = await lastValueFrom(
      this.client.send<{ result: number; pattern: string }>({ cmd: 'sum' }, data),
    );
    return `${result.result}`;
  }

  @MessagePattern({ cmd: 'sum' })
  sum(
    @Payload() data: number[],
    @Ctx() context: PulsarContext,
  ): { result: number; pattern: string } {
    return {
      result: (data || []).reduce((a, b) => a + b, 0),
      pattern: context.getPattern(),
    };
  }
}
