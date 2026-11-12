import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor, toPage } from './cursor';

describe('cursor pagination', () => {
  it('round trips a cursor', () => {
    const cursor = { at: new Date('2026-11-12T10:00:00.123Z'), id: 'msg_abc' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('rejects garbage cursors', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(BadRequestException);
  });

  it('only returns a next cursor when more rows exist', () => {
    const rows = [1, 2, 3].map((index) => ({ id: `r${index}`, at: new Date(index * 1000) }));
    expect(toPage(rows, 3, (row) => row).nextCursor).toBeNull();
    const page = toPage(rows, 2, (row) => row);
    expect(page.data).toHaveLength(2);
    expect(decodeCursor(page.nextCursor ?? undefined)?.id).toBe('r2');
  });
});
