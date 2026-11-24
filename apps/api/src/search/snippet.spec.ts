import { snippet } from './snippet';

function joined(text: string, tokens: string[]): string {
  return snippet(text, tokens)
    .map((segment) => segment.text)
    .join('');
}

describe('snippet', () => {
  it('windows a match in the middle and marks the ellipses', () => {
    const text = `${'alpha '.repeat(40)}Kelp ${'beta '.repeat(40)}`;
    const segments = snippet(text, ['kelp']);
    expect(segments[0]).toEqual({ text: '…', match: false });
    expect(segments.at(-1)).toEqual({ text: '…', match: false });
    expect(segments.find((segment) => segment.match)?.text).toBe('Kelp');
    const inner = segments
      .slice(1, -1)
      .map((segment) => segment.text)
      .join('');
    expect(inner.length).toBeLessThanOrEqual(160);
    expect(text.includes(inner)).toBe(true);
    expect(joined(text, ['kelp'])).toBe(`…${inner}…`);
  });

  it('starts at the match when it is the first word', () => {
    const text = `Kelp ${'alpha '.repeat(40)}`;
    const segments = snippet(text, ['kelp']);
    expect(segments[0]).toEqual({ text: 'Kelp', match: true });
    expect(segments.at(-1)).toEqual({ text: '…', match: false });
    const inner = segments
      .slice(0, -1)
      .map((segment) => segment.text)
      .join('');
    expect(text.startsWith(inner)).toBe(true);
    expect(inner.length).toBeLessThanOrEqual(160);
  });

  it('ends at the match when it is the last word', () => {
    const text = `${'alpha '.repeat(40)}Kelp`;
    const segments = snippet(text, ['kelp']);
    expect(segments[0]).toEqual({ text: '…', match: false });
    expect(segments.at(-1)).toEqual({ text: 'Kelp', match: true });
    const inner = segments
      .slice(1)
      .map((segment) => segment.text)
      .join('');
    expect(text.endsWith(inner)).toBe(true);
    expect(inner.length).toBeLessThanOrEqual(160);
  });

  it('marks every token occurrence inside the window', () => {
    const text = 'one kelp two kelp three';
    expect(snippet(text, ['kelp'])).toEqual([
      { text: 'one ', match: false },
      { text: 'kelp', match: true },
      { text: ' two ', match: false },
      { text: 'kelp', match: true },
      { text: ' three', match: false },
    ]);
  });

  it('keeps the original casing of a case-insensitive match', () => {
    expect(snippet('The KELP forest', ['kelp'])).toEqual([
      { text: 'The ', match: false },
      { text: 'KELP', match: true },
      { text: ' forest', match: false },
    ]);
  });

  it('does not throw when a token contains regex characters', () => {
    expect(() => snippet('see a+b now', ['a+b'])).not.toThrow();
    expect(snippet('see a+b now', ['a+b'])).toEqual([
      { text: 'see ', match: false },
      { text: 'a+b', match: true },
      { text: ' now', match: false },
    ]);
    expect(() => snippet('hello', ['(kelp)'])).not.toThrow();
  });

  it('returns one non-match segment when no token occurs', () => {
    expect(snippet('no otter here', ['kelp'])).toEqual([
      { text: 'no otter here', match: false },
    ]);
    const long = 'alpha '.repeat(40);
    const segments = snippet(long, ['kelp']);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.match).toBe(false);
    expect(long.startsWith(segments[0]?.text ?? '')).toBe(true);
    expect((segments[0]?.text.length ?? 0) <= 160).toBe(true);
    expect(segments[0]?.text.endsWith(' ')).toBe(true);
  });
});
