import { isObject } from '@nestjs/common/utils/shared.utils';
import { ReadPacket } from '../interfaces';
import { Serializer } from '../interfaces/serializer.interface';
import { PulsarRecord } from '../record-builders/pulsar.record-builder';

export class PulsarRecordSerializer implements Serializer<
  ReadPacket,
  ReadPacket & Partial<PulsarRecord>
> {
  serialize(packet: ReadPacket): ReadPacket & Partial<PulsarRecord> {
    if (
      packet?.data &&
      isObject(packet.data) &&
      packet.data instanceof PulsarRecord
    ) {
      const record = packet.data;
      return {
        ...packet,
        data: record.data,
        options: record.options,
      };
    }
    return packet;
  }
}
