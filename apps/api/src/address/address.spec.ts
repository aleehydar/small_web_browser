import { canonicalize } from './address';

const cases: { name: string; input: string; address?: string }[] = [
  { name: 'tidepool.zz', input: 'tidepool.zz', address: 'tidepool.zz' },
  {
    name: 'trimmed uppercase',
    input: ' TIDEPOOL.ZZ ',
    address: 'tidepool.zz',
  },
  {
    name: 'web prefix and trailing slash',
    input: 'web://tidepool.zz/',
    address: 'tidepool.zz',
  },
  { name: 'trailing slash', input: 'tidepool.zz/', address: 'tidepool.zz' },
  { name: 'http url', input: 'HTTP://Evil.com' },
  { name: 'double dot', input: 'a..zz' },
  { name: 'leading hyphen', input: '-a.zz' },
  { name: 'trailing hyphen', input: 'a-.zz' },
  { name: 'empty label', input: '.zz' },
  { name: 'empty string', input: '' },
  { name: 'space', input: 'tide pool.zz' },
  { name: 'path', input: 'tidepool.zz/page' },
  { name: 'extra domain', input: 'tidepool.zz.evil.com' },
  { name: '60-char label', input: `${'a'.repeat(60)}.zz` },
  { name: 'cyrillic a', input: 'ti\u0430pool.zz' },
];

describe('canonicalize', () => {
  it.each(cases)('$name', ({ input, address }) => {
    if (address === undefined) {
      expect(canonicalize(input)).toEqual({ ok: false });
      return;
    }
    expect(canonicalize(input)).toEqual({ ok: true, address });
  });
});
