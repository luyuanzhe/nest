import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import {
  ClientProxy,
  ClientProxyFactory,
  Ctx,
  EventPattern,
  MessagePattern,
  Payload,
  PulsarContext,
  PulsarRecordBuilder,
  Transport,
} from '@nestjs/microservices';
import { from, lastValueFrom, Observable, of } from 'rxjs';
import { scan } from 'rxjs/operators';

@Controller()
export class PulsarController {
  static IS_NOTIFIED = false;

  client: ClientProxy;

  constructor() {
    this.client = ClientProxyFactory.create({
      transport: Transport.PULSAR,
      options: {
        serviceUrl: `pulsar://localhost:6650`,
        namespace: 'public/default',
        topic: 'test',
        subscription: 'test-subscription',
      },
    });
  }

  @Post()
  @HttpCode(200)
  call(@Query('command') cmd, @Body() data: number[]) {
    return this.client.send<number>({ cmd }, data);
  }

  @Post('stream')
  @HttpCode(200)
  stream(@Body() data: number[]): Observable<number> {
    return this.client
      .send<number>({ cmd: 'streaming' }, data)
      .pipe(scan((a, b) => a + b));
  }

  @Post('concurrent')
  @HttpCode(200)
  concurrent(@Body() data: number[][]): Promise<boolean> {
    const send = async (tab: number[]) => {
      const expected = tab.reduce((a, b) => a + b);
      const result = await lastValueFrom(
        this.client.send<number>({ cmd: 'sum' }, tab),
      );

      return result === expected;
    };
    return data
      .map(async tab => send(tab))
      .reduce(async (a, b) => (await a) && b);
  }

  @Post('record-builder-duplex')
  @HttpCode(200)
  recordBuilderDuplex(@Body() data: number[]) {
    const record = new PulsarRecordBuilder(data)
      .setOptions({
        properties: { origin: 'test' },
      })
      .build();
    return this.client.send<number>({ cmd: 'sum' }, record);
  }

  @MessagePattern({ cmd: 'sum' })
  sum(data: number[], @Ctx() context: PulsarContext): number {
    return data.reduce((a, b) => a + b);
  }

  @MessagePattern({ cmd: 'asyncSum' })
  async asyncSum(data: number[]): Promise<number> {
    return data.reduce((a, b) => a + b);
  }

  @MessagePattern({ cmd: 'streamSum' })
  streamSum(data: number[]): Observable<number> {
    return from(data);
  }

  @MessagePattern({ cmd: 'streaming' })
  streaming(data: number[]): Observable<number> {
    return from(data);
  }

  @EventPattern('notify')
  eventHandler(data: number[], @Ctx() context: PulsarContext) {
    PulsarController.IS_NOTIFIED = true;
  }
}
