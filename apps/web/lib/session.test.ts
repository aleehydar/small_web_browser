import { describe, expect, it } from "vitest";
import {
  back,
  canBack,
  canForward,
  current,
  emptySession,
  forward,
  push,
  saveScroll,
  type Entry,
  type PageEntry,
} from "./session";

function page(address: string, document: string): PageEntry {
  return {
    kind: "page",
    via: "link",
    address,
    revisionId: address,
    title: address,
    authorName: "Mira Sol",
    publishedAt: "2026-05-02T10:00:00.000Z",
    document,
    scrollTop: 0,
  };
}

function addresses(entries: Entry[]): string[] {
  return entries.map((entry) =>
    entry.kind === "search" ? `search:${entry.query}` : entry.address,
  );
}

describe("session", () => {
  it("starts with nothing to go back or forward to", () => {
    expect(current(emptySession)).toBeNull();
    expect(canBack(emptySession)).toBe(false);
    expect(canForward(emptySession)).toBe(false);
    expect(back(emptySession)).toBe(emptySession);
    expect(forward(emptySession)).toBe(emptySession);
  });

  it("pushes a trail and walks back and forward over the same entries", () => {
    const first = page("tidepool.zz", "<p>first</p>");
    const second = page("lantern.zz", "<p>second</p>");
    const third = page("kelp.zz", "<p>third</p>");
    const trail = [first, second, third].reduce(
      (session, entry) => push(session, entry),
      emptySession,
    );

    expect(addresses(trail.entries)).toEqual([
      "tidepool.zz",
      "lantern.zz",
      "kelp.zz",
    ]);
    expect(current(trail)).toBe(third);
    expect(canForward(trail)).toBe(false);

    const middle = back(trail);
    const start = back(middle);
    const restored = current(start);
    expect(restored).toBe(first);
    expect(restored?.kind === "page" ? restored.document : "").toBe(
      "<p>first</p>",
    );
    expect(canBack(start)).toBe(false);
    expect(back(start)).toBe(start);

    const returned = forward(forward(start));
    expect(current(returned)).toBe(third);
    expect(forward(returned)).toBe(returned);
  });

  it("drops the forward trail when a new page is opened from the middle", () => {
    const trail = ["tidepool.zz", "lantern.zz", "kelp.zz", "margin.zz"].reduce(
      (session, address) => push(session, page(address, address)),
      emptySession,
    );
    const branched = push(back(back(trail)), {
      kind: "search",
      query: "phosphorescence",
      results: [],
      scrollTop: 0,
    });

    expect(addresses(branched.entries)).toEqual([
      "tidepool.zz",
      "lantern.zz",
      "search:phosphorescence",
    ]);
    expect(canForward(branched)).toBe(false);
    expect(current(back(branched))?.kind).toBe("page");
  });

  it("keeps a missing address on the stack so back can leave it", () => {
    const opened = push(push(emptySession, page("tidepool.zz", "pool")), {
      kind: "missing",
      address: "saltglass.zz",
    });
    expect(current(opened)).toEqual({ kind: "missing", address: "saltglass.zz" });
    const returned = current(back(opened));
    expect(returned?.kind === "page" ? returned.document : "").toBe("pool");
  });

  it("saveScroll writes onto the current entry only", () => {
    let session = emptySession;
    session = saveScroll(push(session, page("a.zz", "a")), 11);
    session = saveScroll(push(session, page("b.zz", "b")), 22);
    session = saveScroll(push(session, page("c.zz", "c")), 33);
    const middle = saveScroll(back(session), 44);
    const [first, currentEntry, last] = middle.entries;
    expect(first?.kind === "page" && first.scrollTop).toBe(11);
    expect(currentEntry?.kind === "page" && currentEntry.scrollTop).toBe(44);
    expect(last?.kind === "page" && last.scrollTop).toBe(33);
    expect(middle.index).toBe(1);
    expect(saveScroll(middle, 44)).toBe(middle);
  });

  it("restores each page's own scroll across back and forward", () => {
    let session = emptySession;
    session = saveScroll(push(session, page("a.zz", "a")), 100);
    session = saveScroll(push(session, page("b.zz", "b")), 200);
    session = saveScroll(push(session, page("c.zz", "c")), 300);
    const start = back(back(session));
    const middle = forward(start);
    const end = forward(middle);
    const startEntry = current(start);
    const middleEntry = current(middle);
    const endEntry = current(end);
    expect(startEntry?.kind === "page" ? startEntry.scrollTop : -1).toBe(100);
    expect(middleEntry?.kind === "page" ? middleEntry.scrollTop : -1).toBe(200);
    expect(endEntry?.kind === "page" ? endEntry.scrollTop : -1).toBe(300);
  });

  it("drops forward scroll positions when a new entry is pushed from the middle", () => {
    let session = emptySession;
    session = saveScroll(push(session, page("a.zz", "a")), 10);
    session = saveScroll(push(session, page("b.zz", "b")), 20);
    session = saveScroll(push(session, page("c.zz", "c")), 30);
    const branched = push(back(session), page("d.zz", "d"));
    const opened = current(branched);
    expect(addresses(branched.entries)).toEqual(["a.zz", "b.zz", "d.zz"]);
    expect(opened?.kind === "page" ? opened.scrollTop : -1).toBe(0);
    expect(branched.entries[0]?.kind === "page" && branched.entries[0].scrollTop).toBe(10);
    expect(branched.entries[1]?.kind === "page" && branched.entries[1].scrollTop).toBe(20);
  });

  it("saveScroll on an empty session or a missing entry returns that same session", () => {
    expect(saveScroll(emptySession, 12)).toBe(emptySession);
    const missing = push(emptySession, {
      kind: "missing",
      address: "saltglass.zz",
    });
    expect(saveScroll(missing, 12)).toBe(missing);
  });

  it("stores a negative or non-finite scroll as 0", () => {
    const session = saveScroll(push(emptySession, page("a.zz", "a")), 15);
    for (const value of [-8, Number.NaN, Number.POSITIVE_INFINITY]) {
      const saved = current(saveScroll(session, value));
      expect(saved?.kind === "page" ? saved.scrollTop : -1).toBe(0);
    }
  });
});
