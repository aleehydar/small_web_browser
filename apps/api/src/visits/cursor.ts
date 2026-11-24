export interface CursorPosition {
  at: Date;
  id: string;
}

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ at: at.toISOString(), id }),
    'utf8',
  ).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPosition {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new Error('malformed cursor');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Error('malformed cursor');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('malformed cursor');
  }
  const at = Reflect.get(parsed, 'at');
  const id = Reflect.get(parsed, 'id');
  if (typeof at !== 'string' || typeof id !== 'string') {
    throw new Error('malformed cursor');
  }
  if (!/^[0-9a-f]{24}$/i.test(id)) {
    throw new Error('malformed cursor');
  }
  const date = new Date(at);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== at) {
    throw new Error('malformed cursor');
  }
  return { at: date, id };
}
