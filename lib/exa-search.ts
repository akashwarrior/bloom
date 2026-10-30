// Exa search leg — semantic web discovery for the webSearch tool.
// Follows build-with-exa skill: recommended request is query + type auto +
// contents { highlights: true } and nothing else. numResults is set because
// the tool's max_results is an intentional product decision (not boilerplate).

import type Exa from "exa-js";

export const EXA_SEARCH_TIMEOUT_MS = 30_000;

export type RawSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type ExaSearchResultLike = {
  title?: string | null;
  url: string;
  highlights?: string[] | null;
  text?: string | null;
};

type ExaSearchResponseLike = {
  results?: ExaSearchResultLike[] | null;
};

type ExaSearchClientLike = Pick<Exa, "search">;

export function normalizeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    url.username = "";
    url.password = "";

    return url.toString();
  } catch {
    return null;
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new Error("Exa search cancelled");
  }
}

function snippetFor(result: ExaSearchResultLike, query: string): string {
  const highlights = (result.highlights ?? []).filter(Boolean);
  if (highlights.length > 0) {
    return highlights.join("\n").slice(0, 1_000);
  }
  if (typeof result.text === "string" && result.text.trim().length > 0) {
    return result.text.trim().slice(0, 1_000);
  }
  return `Web result for "${query}".`;
}

export function mapExaSearchResults(
  response: ExaSearchResponseLike,
  query: string,
  limit: number,
): RawSearchResult[] {
  const seen = new Set<string>();
  const rows: RawSearchResult[] = [];
  for (const result of response.results ?? []) {
    if (!result?.url) continue;
    const url = normalizeHttpUrl(result.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = (result.title ?? "").trim() || url;
    rows.push({
      title: title.slice(0, 300),
      url,
      snippet: snippetFor(result, query).slice(0, 1_000),
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

export async function searchExa(
  query: string,
  maxResults: number,
  options?: {
    signal?: AbortSignal;
    client?: ExaSearchClientLike;
  },
): Promise<RawSearchResult[]> {
  throwIfAborted(options?.signal);
  // Lazy client load keeps this module importable in plain node:test
  // (exa-client.server.ts pulls in `server-only`, which throws outside
  // react-server). Tests always inject a mock client, so this path only
  // runs on the server.
  const client = options?.client ?? (await import("./exa-client.server.ts")).getExaClient();
  const limit = Math.max(1, Math.min(12, Math.floor(maxResults)));

  const timeout = AbortSignal.timeout(EXA_SEARCH_TIMEOUT_MS);
  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  throwIfAborted(signal);

  // exa-js does not accept an AbortSignal; check cancellation before/after.
  const response = (await client.search(query, {
    type: "auto",
    numResults: limit,
    contents: { highlights: true },
  })) as unknown as ExaSearchResponseLike;

  throwIfAborted(signal);
  return mapExaSearchResults(response, query, limit);
}
