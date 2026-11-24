import type { SearchHit, Via } from "./session";

export type Person = {
  id: string;
  slug: string;
  name: string;
};

export type Page = {
  address: string;
  revisionId: string;
  title: string;
  authorName: string;
  publishedAt: string;
  document: string;
};

export type Visit = {
  id: string;
  address: string;
  title: string;
  via: Via;
  at: string;
};

export type HistoryPage = {
  items: Visit[];
  nextCursor: string | null;
};

export class ApiError extends Error {
  readonly status: number;
  readonly address?: string;

  constructor(status: number, message: string, address?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.address = address;
  }
}

export function navigationId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 32);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw await toError(response);
  }
  return (await response.json()) as T;
}

async function toError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  let message = response.statusText || "Request failed";
  let address: string | undefined;
  if (typeof body === "object" && body !== null) {
    const record = body as { message?: unknown; address?: unknown };
    if (typeof record.address === "string") {
      address = record.address;
    }
    if (typeof record.message === "string" && record.message.trim() !== "") {
      message = record.message;
    } else if (Array.isArray(record.message)) {
      const parts = record.message.filter(
        (item): item is string => typeof item === "string",
      );
      if (parts.length > 0) {
        message = parts.join(" ");
      }
    }
  }
  return new ApiError(response.status, message, address);
}

export function listPeople(): Promise<Person[]> {
  return request("/api/people");
}

export function resolveAddress(address: string): Promise<Page> {
  const params = new URLSearchParams({ address });
  return request(`/api/resolve?${params}`);
}

export function searchPages(
  q: string,
): Promise<{ query: string; results: SearchHit[] }> {
  const params = new URLSearchParams({ q });
  return request(`/api/search?${params}`);
}

export function recordVisit(body: {
  personId: string;
  revisionId: string;
  via: Via;
  clientNavId: string;
}): Promise<Visit> {
  return request("/api/visits", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchHistory(
  personId: string,
  cursor?: string,
): Promise<HistoryPage> {
  const params = new URLSearchParams({ limit: "30" });
  if (cursor !== undefined) {
    params.set("cursor", cursor);
  }
  return request(`/api/people/${personId}/history?${params}`);
}

export function publishSite(body: {
  authorId: string;
  address: string;
  title: string;
  html: string;
}): Promise<{ address: string; revisionId: string }> {
  return request("/api/sites", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
