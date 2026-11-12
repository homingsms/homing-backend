import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export interface Cursor {
  at: Date;
  id: string;
}

const cursorSchema = z.tuple([z.string().datetime(), z.string().min(1).max(64)]);

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.at.toISOString(), cursor.id])).toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    return { at: new Date(parsed[0]), id: parsed[1] };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor): Page<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  return {
    data,
    nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null,
  };
}
