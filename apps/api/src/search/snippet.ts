export interface Segment {
  text: string;
  match: boolean;
}

const WINDOW = 160;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

interface Occurrence {
  index: number;
  length: number;
}

function occurrences(text: string, tokens: string[]): Occurrence[] {
  const usable = [...tokens]
    .filter((token) => token.length > 0)
    .sort((left, right) => right.length - left.length);
  if (usable.length === 0) {
    return [];
  }
  const pattern = usable.map(escapeRegExp).join('|');
  const expression = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`,
    'giu',
  );
  const found: Occurrence[] = [];
  for (const match of text.matchAll(expression)) {
    if (match.index === undefined) {
      continue;
    }
    found.push({ index: match.index, length: match[0].length });
  }
  return found;
}

function snapStart(text: string, index: number, limit: number): number {
  if (index <= 0) {
    return 0;
  }
  if (!isWordChar(text[index] ?? '') || !isWordChar(text[index - 1] ?? '')) {
    return index;
  }
  let cursor = index;
  while (cursor < limit && cursor < text.length && isWordChar(text[cursor] ?? '')) {
    cursor += 1;
  }
  return cursor;
}

function snapEnd(text: string, index: number, limit: number): number {
  if (index >= text.length) {
    return text.length;
  }
  if (index <= 0) {
    return 0;
  }
  if (!isWordChar(text[index - 1] ?? '') || !isWordChar(text[index] ?? '')) {
    return index;
  }
  let cursor = index;
  while (cursor > limit && isWordChar(text[cursor - 1] ?? '')) {
    cursor -= 1;
  }
  return cursor;
}

function prefix(text: string): Segment[] {
  const end = snapEnd(text, Math.min(WINDOW, text.length), 0);
  const slice = text.slice(0, end);
  if (slice.length === 0) {
    return [];
  }
  return [{ text: slice, match: false }];
}

export function snippet(text: string, tokens: string[]): Segment[] {
  const matches = occurrences(text, tokens);
  const first = matches[0];
  if (first === undefined) {
    return prefix(text);
  }

  let start = first.index;
  let end = first.index + first.length;
  if (first.length < WINDOW) {
    const half = Math.floor((WINDOW - first.length) / 2);
    start = Math.max(0, first.index - half);
    end = Math.min(text.length, start + WINDOW);
    if (end - start < WINDOW) {
      start = Math.max(0, end - WINDOW);
    }
    start = snapStart(text, start, first.index);
    end = snapEnd(text, end, first.index + first.length);
    if (start > first.index) {
      start = first.index;
    }
    if (end < first.index + first.length) {
      end = first.index + first.length;
    }
  }

  const segments: Segment[] = [];
  if (start > 0) {
    segments.push({ text: '…', match: false });
  }
  let cursor = start;
  for (const match of matches) {
    if (match.index < cursor || match.index >= end) {
      continue;
    }
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), match: false });
    }
    const matchEnd = Math.min(end, match.index + match.length);
    segments.push({ text: text.slice(match.index, matchEnd), match: true });
    cursor = matchEnd;
  }
  if (cursor < end) {
    segments.push({ text: text.slice(cursor, end), match: false });
  }
  if (end < text.length) {
    segments.push({ text: '…', match: false });
  }
  return segments;
}
