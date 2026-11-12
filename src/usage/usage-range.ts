import { BadRequestException } from '@nestjs/common';
import { addDays, toUtcDateString } from '@/common/dates';
import { MAX_USAGE_DAYS } from './dto/usage-range.query.dto';

export interface UsageRange {
  start: Date;
  endExclusive: Date;
  days: string[];
}

export function resolveRange(from: string, to: string): UsageRange {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || toUtcDateString(start) !== from || toUtcDateString(end) !== to) {
    throw new BadRequestException(['from and to must be valid calendar dates']);
  }
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (span < 0) {
    throw new BadRequestException(['to must not be before from']);
  }
  if (span >= MAX_USAGE_DAYS) {
    throw new BadRequestException([`The range can cover at most ${MAX_USAGE_DAYS} days`]);
  }
  const days = Array.from({ length: span + 1 }, (_value, index) => toUtcDateString(addDays(start, index)));
  return { start, endExclusive: addDays(end, 1), days };
}
