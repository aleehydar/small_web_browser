export type Via = "typed" | "link" | "search" | "history";

export type Segment = {
  text: string;
  match: boolean;
};

export type SearchHit = {
  address: string;
  title: string;
  snippet: Segment[];
};

export type PageEntry = {
  kind: "page";
  via: Via;
  address: string;
  revisionId: string;
  title: string;
  authorName: string;
  publishedAt: string;
  document: string;
  scrollTop: number;
};

export type MissingEntry = {
  kind: "missing";
  address: string;
};

export type SearchEntry = {
  kind: "search";
  query: string;
  results: SearchHit[];
  scrollTop: number;
};

export type Entry = PageEntry | MissingEntry | SearchEntry;

export type Session = {
  entries: Entry[];
  index: number;
};

export const emptySession: Session = { entries: [], index: -1 };

export function current(session: Session): Entry | null {
  if (session.index < 0 || session.index >= session.entries.length) {
    return null;
  }
  return session.entries[session.index] ?? null;
}

export function canBack(session: Session): boolean {
  return session.index > 0;
}

export function canForward(session: Session): boolean {
  return session.index >= 0 && session.index < session.entries.length - 1;
}

export function push(session: Session, entry: Entry): Session {
  const entries = session.entries.slice(0, session.index + 1);
  entries.push(entry);
  return { entries, index: entries.length - 1 };
}

export function back(session: Session): Session {
  if (!canBack(session)) {
    return session;
  }
  return { entries: session.entries, index: session.index - 1 };
}

export function forward(session: Session): Session {
  if (!canForward(session)) {
    return session;
  }
  return { entries: session.entries, index: session.index + 1 };
}

export function saveScroll(session: Session, scrollTop: number): Session {
  const entry = current(session);
  if (entry === null || entry.kind === "missing") {
    return session;
  }
  const top = Number.isFinite(scrollTop) && scrollTop > 0 ? scrollTop : 0;
  if (entry.scrollTop === top) {
    return session;
  }
  const entries = session.entries.slice();
  entries[session.index] = { ...entry, scrollTop: top };
  return { entries, index: session.index };
}
