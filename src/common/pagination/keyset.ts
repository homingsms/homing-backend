import { and, eq, lt, or, type AnyColumn, type SQL } from 'drizzle-orm';
import type { Cursor } from './cursor';

export function beforeCursor(atColumn: AnyColumn, idColumn: AnyColumn, cursor: Cursor | null): SQL | undefined {
  if (!cursor) {
    return undefined;
  }
  return or(lt(atColumn, cursor.at), and(eq(atColumn, cursor.at), lt(idColumn, cursor.id)));
}
