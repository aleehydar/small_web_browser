"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ApiError,
  fetchHistory,
  listPeople,
  navigationId,
  publishSite,
  recordVisit,
  resolveAddress,
  searchPages,
  type Person,
  type Visit,
} from "../lib/api";
import {
  back,
  canBack,
  canForward,
  current,
  emptySession,
  forward,
  push,
  type SearchHit,
  type Via,
} from "../lib/session";

const PERSON_KEY = "smallweb.personId";

const VIA_LABEL: Record<Via, string> = {
  typed: "Typed",
  link: "Link",
  search: "Search",
  history: "History",
};

export default function Browser() {
  const [people, setPeople] = useState<Person[]>([]);
  const [personId, setPersonId] = useState("");
  const [session, setSession] = useState(emptySession);
  const [phase, setPhase] = useState<"idle" | "loading">("idle");
  const [pending, setPending] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [historyItems, setHistoryItems] = useState<Visit[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [authorId, setAuthorId] = useState("");
  const [publishAddress, setPublishAddress] = useState("");
  const [publishTitle, setPublishTitle] = useState("");
  const [publishHtml, setPublishHtml] = useState("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const flight = useRef(0);

  const entry = current(session);

  useEffect(() => {
    let cancelled = false;
    void listPeople()
      .then((rows) => {
        if (cancelled) return;
        setPeople(rows);
        const saved = window.localStorage.getItem(PERSON_KEY);
        const match = rows.find((person) => person.id === saved) ?? rows[0];
        if (match !== undefined) {
          setPersonId(match.id);
          setAuthorId((currentAuthor) => currentAuthor || match.id);
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(messageOf(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (personId === "") return;
    window.localStorage.setItem(PERSON_KEY, personId);
  }, [personId]);

  useEffect(() => {
    if (entry?.kind === "page") {
      document.title = `${entry.title} — Small Web`;
      return;
    }
    if (entry?.kind === "search") {
      document.title = `Search “${entry.query}” — Small Web`;
      return;
    }
    if (entry?.kind === "missing") {
      document.title = `${entry.address} — Small Web`;
      return;
    }
    document.title = "Small Web";
  }, [entry]);

  useEffect(() => {
    if (entry?.kind === "search") {
      setAddressDraft("");
      setSearchDraft(entry.query);
      return;
    }
    if (entry?.kind === "page" || entry?.kind === "missing") {
      setAddressDraft(entry.address);
      setSearchDraft("");
      return;
    }
    setAddressDraft("");
    setSearchDraft("");
  }, [entry]);

  useEffect(() => {
    if (personId === "") return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryReady(false);
    setHistoryError(null);
    void fetchHistory(personId)
      .then((page) => {
        if (cancelled) return;
        setHistoryItems(page.items);
        setHistoryCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setHistoryItems([]);
        setHistoryCursor(null);
        setHistoryError(messageOf(cause));
      })
      .finally(() => {
        if (cancelled) return;
        setHistoryLoading(false);
        setHistoryReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, historyVersion]);

  const cancelFlight = useCallback(() => {
    flight.current += 1;
    setPhase("idle");
    setPending("");
  }, []);

  const goBack = useCallback(() => {
    cancelFlight();
    setError(null);
    setSession((value) => back(value));
  }, [cancelFlight]);

  const goForward = useCallback(() => {
    cancelFlight();
    setError(null);
    setSession((value) => forward(value));
  }, [cancelFlight]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goForward();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack, goForward]);

  const openAddress = useCallback(
    async (raw: string, via: Via) => {
      const address = raw.trim();
      if (address === "") return;
      if (personId === "") {
        setError("Choose who is browsing.");
        return;
      }
      const id = ++flight.current;
      setAddressDraft(address);
      setPhase("loading");
      setPending(address);
      setError(null);
      setNotice(null);
      setPublishOpen(false);
      try {
        const page = await resolveAddress(address);
        if (flight.current !== id) return;
        try {
          await recordVisit({
            personId,
            revisionId: page.revisionId,
            via,
            clientNavId: navigationId(),
          });
          if (flight.current !== id) return;
          setHistoryVersion((version) => version + 1);
        } catch (cause: unknown) {
          if (flight.current !== id) return;
          setNotice(messageOf(cause));
        }
        setSession((value) =>
          push(value, {
            kind: "page",
            via,
            address: page.address,
            revisionId: page.revisionId,
            title: page.title,
            authorName: page.authorName,
            publishedAt: page.publishedAt,
            document: page.document,
          }),
        );
      } catch (cause: unknown) {
        if (flight.current !== id) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setSession((value) =>
            push(value, {
              kind: "missing",
              address: cause.address ?? address,
            }),
          );
          return;
        }
        setError(messageOf(cause));
      } finally {
        if (flight.current === id) {
          setPhase("idle");
          setPending("");
        }
      }
    },
    [personId],
  );

  const openAddressRef = useRef(openAddress);
  useEffect(() => {
    openAddressRef.current = openAddress;
  });
  const openLink = useCallback((address: string) => {
    void openAddressRef.current(address, "link");
  }, []);

  async function runSearch(raw: string) {
    const query = raw.trim();
    if (query === "") return;
    const id = ++flight.current;
    setSearchDraft(query);
    setPhase("loading");
    setPending(query);
    setError(null);
    setNotice(null);
    setPublishOpen(false);
    try {
      const found = await searchPages(query);
      if (flight.current !== id) return;
      setSession((value) =>
        push(value, {
          kind: "search",
          query: found.query,
          results: found.results,
        }),
      );
    } catch (cause: unknown) {
      if (flight.current !== id) return;
      setError(messageOf(cause));
    } finally {
      if (flight.current === id) {
        setPhase("idle");
        setPending("");
      }
    }
  }

  async function loadMoreHistory() {
    if (personId === "" || historyCursor === null || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const page = await fetchHistory(personId, historyCursor);
      setHistoryItems((items) => [...items, ...page.items]);
      setHistoryCursor(page.nextCursor);
    } catch (cause: unknown) {
      setHistoryError(messageOf(cause));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function onPublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      authorId === "" ||
      publishAddress.trim() === "" ||
      publishTitle.trim() === "" ||
      publishHtml.trim() === ""
    ) {
      setPublishError("Author, address, title, and HTML are required.");
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      const created = await publishSite({
        authorId,
        address: publishAddress,
        title: publishTitle,
        html: publishHtml,
      });
      setPublishAddress("");
      setPublishTitle("");
      setPublishHtml("");
      await openAddress(created.address, "typed");
    } catch (cause: unknown) {
      setPublishError(messageOf(cause));
    } finally {
      setPublishing(false);
    }
  }

  const person = people.find((item) => item.id === personId);

  return (
    <div className="shell">
      <header className="chrome">
        <div className="brand-row">
          <div className="brand">
            <p className="wordmark">Small Web</p>
            <p className="brand-note">A page lives at an address, and nowhere else.</p>
          </div>
          <label className="person">
            <span>Browsing as</span>
            <select
              value={personId}
              onChange={(event) => {
                setPersonId(event.target.value);
                setAuthorId(event.target.value);
                setHistoryItems([]);
                setHistoryCursor(null);
                setHistoryReady(false);
              }}
            >
              {people.length === 0 ? <option value="">No one yet</option> : null}
              {people.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="controls">
          <div className="nav-buttons">
            <button
              type="button"
              onClick={goBack}
              disabled={!canBack(session)}
            >
              Back
            </button>
            <button
              type="button"
              onClick={goForward}
              disabled={!canForward(session)}
            >
              Forward
            </button>
          </div>
          <form
            className="address-form"
            onSubmit={(event) => {
              event.preventDefault();
              void openAddress(addressDraft, "typed");
            }}
          >
            <label className="grow">
              <span className="sr">Address</span>
              <input
                value={addressDraft}
                onChange={(event) => setAddressDraft(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                placeholder="tidepool.zz"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                enterKeyHint="go"
              />
            </label>
            <button type="submit">Go</button>
          </form>
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch(searchDraft);
            }}
          >
            <label className="grow">
              <span className="sr">Search the text of every page</span>
              <input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search what the pages say"
                enterKeyHint="search"
              />
            </label>
            <button type="submit">Search</button>
          </form>
          <button
            type="button"
            className="publish-button"
            aria-expanded={publishOpen}
            onClick={() => {
              setPublishOpen((open) => !open);
              setPublishError(null);
              if (authorId === "" && personId !== "") setAuthorId(personId);
            }}
          >
            Publish
          </button>
        </div>
      </header>

      {error !== null ? (
        <p className="banner error" role="alert">
          {error}
        </p>
      ) : null}
      {notice !== null ? (
        <p className="banner notice" role="status">
          The page is open. The visit was not recorded: {notice}
        </p>
      ) : null}

      <div className="workspace">
        <main className="stage" aria-busy={phase === "loading"}>
          {phase === "loading" ? (
            <Status
              kicker="Loading"
              title={pending}
              body="Asked for, not shown yet."
            />
          ) : publishOpen ? (
            <form className="publish" onSubmit={(event) => void onPublish(event)}>
              <p className="kicker">Publish</p>
              <h1>Put a page at an address.</h1>
              <p className="lede">
                The HTML is sanitized before it is stored. Scripts, event
                handlers, and addresses outside <code>.zz</code> do not survive.
              </p>
              <label>
                Author
                <select
                  value={authorId}
                  onChange={(event) => setAuthorId(event.target.value)}
                >
                  {people.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Address
                <input
                  value={publishAddress}
                  onChange={(event) => setPublishAddress(event.target.value)}
                  placeholder="newpier.zz"
                  spellCheck={false}
                  autoCapitalize="off"
                />
              </label>
              <label>
                Title
                <input
                  value={publishTitle}
                  onChange={(event) => setPublishTitle(event.target.value)}
                  placeholder="A name for the page"
                  maxLength={120}
                />
              </label>
              <label>
                HTML
                <textarea
                  value={publishHtml}
                  onChange={(event) => setPublishHtml(event.target.value)}
                  rows={10}
                  spellCheck
                  placeholder={
                    '<p>Write the page.</p>\n<p>See also <a href="tidepool.zz">tidepool.zz</a>.</p>'
                  }
                />
              </label>
              {publishError !== null ? (
                <p className="form-error" role="alert">
                  {publishError}
                </p>
              ) : null}
              <div className="form-actions">
                <button type="submit" className="solid" disabled={publishing}>
                  {publishing ? "Publishing" : "Publish page"}
                </button>
                <button
                  type="button"
                  onClick={() => setPublishOpen(false)}
                  disabled={publishing}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : entry?.kind === "page" ? (
            <>
              <div className="meta">
                <div>
                  <p className="meta-title">{entry.title}</p>
                  <p className="meta-sub">
                    {entry.address} · {entry.authorName} · Published{" "}
                    {formatWhen(entry.publishedAt)} · {VIA_LABEL[entry.via]}
                  </p>
                </div>
              </div>
              <PageFrame
                key={session.index}
                documentHtml={entry.document}
                title={entry.title}
                onLink={openLink}
              />
            </>
          ) : entry?.kind === "search" ? (
            <SearchResults
              query={entry.query}
              results={entry.results}
              onOpen={(address) => void openAddress(address, "search")}
            />
          ) : entry?.kind === "missing" ? (
            <Status
              kicker="Nowhere"
              title={entry.address}
              body="No such address. Nothing was published here, so this stop was not added to history."
            />
          ) : (
            <Status
              kicker="Start"
              title="Where do you want to read?"
              body={
                person === undefined
                  ? "Seed the web, then pick a person. History belongs to whoever is browsing."
                  : `${person.name} is browsing. Type an address, or start from one of these.`
              }
            >
              <div className="hints">
                {["tidepool.zz", "harbor.zz", "atlas.zz"].map((address) => (
                  <button
                    key={address}
                    type="button"
                    onClick={() => void openAddress(address, "typed")}
                  >
                    {address}
                  </button>
                ))}
              </div>
            </Status>
          )}
        </main>

        <aside className="history" aria-label="History">
          <div className="history-head">
            <h2>History</h2>
            <p>
              {person === undefined
                ? "Per person, newest first."
                : `${person.name}, newest first. A row opens the address as it is now.`}
            </p>
          </div>
          {historyError !== null ? (
            <p className="history-note" role="alert">
              {historyError}
            </p>
          ) : null}
          {historyReady &&
          historyItems.length === 0 &&
          historyError === null ? (
            <p className="history-note">No visits yet.</p>
          ) : null}
          <ol>
            {historyItems.map((visit) => {
              const active =
                entry?.kind === "page" && entry.address === visit.address;
              return (
                <li key={visit.id}>
                  <button
                    type="button"
                    className={active ? "visit active" : "visit"}
                    onClick={() => void openAddress(visit.address, "history")}
                  >
                    <span className="visit-title">{visit.title}</span>
                    <span className="visit-address">{visit.address}</span>
                    <span className="visit-meta">
                      {VIA_LABEL[visit.via]} · {formatWhen(visit.at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {historyCursor !== null ? (
            <button
              type="button"
              className="more"
              onClick={() => void loadMoreHistory()}
              disabled={historyLoading}
            >
              {historyLoading ? "Loading" : "Older visits"}
            </button>
          ) : null}
          {!historyReady && historyItems.length === 0 && historyError === null ? (
            <p className="history-note">Loading history.</p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function PageFrame({
  documentHtml,
  title,
  onLink,
}: {
  documentHtml: string;
  title: string;
  onLink: (address: string) => void;
}) {
  return (
    <iframe
      className="page-frame"
      title={title}
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      srcDoc={documentHtml}
      onLoad={(event) => {
        const doc = event.currentTarget.contentDocument;
        if (doc === null) return;
        const FrameElement = doc.defaultView?.Element;
        if (FrameElement === undefined) return;
        doc.addEventListener("click", (click) => {
          const target = click.target;
          // The frame is a nested window, so the parent's Element rejects it.
          if (!(target instanceof FrameElement)) return;
          const anchor = target.closest("a");
          if (anchor === null) return;
          click.preventDefault();
          const address = anchor.getAttribute("data-addr");
          if (address !== null && address !== "") {
            onLink(address);
          }
        });
      }}
    />
  );
}

function SearchResults({
  query,
  results,
  onOpen,
}: {
  query: string;
  results: SearchHit[];
  onOpen: (address: string) => void;
}) {
  return (
    <div className="results">
      <p className="kicker">Search</p>
      <h1>{query}</h1>
      <p className="lede">
        {results.length === 0
          ? "Nothing in the web matches those words."
          : `${results.length} ${results.length === 1 ? "page" : "pages"}, ranked by the words in them.`}
      </p>
      <ol className="hits">
        {results.map((hit) => (
          <li key={hit.address}>
            <button type="button" onClick={() => onOpen(hit.address)}>
              <span className="hit-address">{hit.address}</span>
              <span className="hit-title">{hit.title}</span>
              <span className="hit-snippet">
                {hit.snippet.map((segment, index) =>
                  segment.match ? (
                    <mark key={index}>{segment.text}</mark>
                  ) : (
                    <span key={index}>{segment.text}</span>
                  ),
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Status({
  kicker,
  title,
  body,
  children,
}: {
  kicker: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="status">
      <p className="kicker">{kicker}</p>
      <h1>{title}</h1>
      <p className="lede">{body}</p>
      {children}
    </div>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function messageOf(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim() !== "") {
    return cause.message;
  }
  return "Something went wrong.";
}
