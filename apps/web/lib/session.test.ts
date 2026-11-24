import { describe, expect, it } from "vitest";
import {
  back,
  canBack,
  canForward,
  current,
  emptySession,
  forward,
  push,
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
});
