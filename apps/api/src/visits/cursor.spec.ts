import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('round trips a timestamp and id', () => {
    const at = new Date('2026-06-03T12:34:56.789Z');
    const id = '507f1f77bcf86cd799439011';
    const decoded = decodeCursor(encodeCursor(at, id));
    expect(decoded.at.toISOString()).toBe(at.toISOString());
    expect(decoded.id).toBe(id);
  });

  it('throws on garbage', () => {
    expect(() => decodeCursor('not a cursor')).toThrow('malformed cursor');
    expect(() => decodeCursor('@@@')).toThrow('malformed cursor');
    expect(() => decodeCursor('')).toThrow('malformed cursor');
    expect(() =>
      decodeCursor(Buffer.from('{"nope":1}', 'utf8').toString('base64url')),
    ).toThrow('malformed cursor');
  });
});
