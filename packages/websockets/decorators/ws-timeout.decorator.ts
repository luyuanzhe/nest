import { SetMetadata } from '@nestjs/common';
import { WS_TIMEOUT_METADATA } from '../constants';

export const WsTimeout = (ms: number) => SetMetadata(WS_TIMEOUT_METADATA, ms);
