// Exa contents leg — clean extraction for known URLs (webRead tool).
// Follows build-with-exa skill: on /contents, text/highlights/summary are
// top-level fields (not nested inside `contents`). Bare `highlights: true`
// is the token-efficient default; pick exactly one, do not stack.

import type Exa from "exa-js";
import { normalizeHttpUrl } from "./exa-search.ts";

export const EXA_CONTENTS_TIMEOUT_MS = 30_000;

export type ExaPage = {
  title: string;
  url: string;
  summary: string;
  sections: Array<{ heading: string; content: string }>;
};

type ExaContentsResultLike = {
  title?: string | null;
  url: string;
  highlights?: string[] | null;
  text?: string | null;
  summary?: string | null;
};

type ExaContentsResponseLike = {
  results?: ExaContentsResultLike[] | null;
  statuses?: Array<{ id?: string; status?: string }> | null;
};

type ExaContentsClientLike = Pick<Exa, "getContents">;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new Error("Exa contents cancelled");
  }
}

function pageFromResult(
  result: ExaContentsResultLike,
): ExaPage | null {
  const url = normalizeHttpUrl(result.url ?? "");
  if (!url) return null;
  const highlights = (result.highlights ?? []).filter(Boolean);
  const text =
    highlights.length > 0
      ? highlights.join("\n")
      : typeof result.text === "string"
        ? result.text
        : typeof result.summary === "string"
          ? result.summary
          : "";
  const trimmed = text.trim();
  if (!trimmed) return null;
  const title = (result.title ?? "").trim() || url;
  const summary = trimmed.slice(0, 2_000);
  const sections = highlights.slice(0, 8).map((highlight, index) => ({
    heading: `Excerpt ${index + 1}`,
    content: highlight.slice(0, 2_500),
  }));
  return {
    title: title.slice(0, 300),
    url,
    summary,
    sections: sections.length > 0
      ? sections
      : [{ heading: "Content", content: summary.slice(0, 2_500) }],
  };
}

export function mapExaContentsResponse(
  response: ExaContentsResponseLike,
  requestedUrls: string[],
): { pages: ExaPage[]; limitations: string[] } {
  const pages: ExaPage[] = [];
  const seen = new Set<string>();
  for (const result of response.results ?? []) {
    const page = pageFromResult(result);
    if (!page || seen.has(page.url)) continue;
    seen.add(page.url);
    pages.push(page);
    if (pages.length >= 10) break;
  }

  const limitations: string[] = [];
  const failed = (response.statuses ?? []).filter(
    (status) => status.status && status.status !== "success",
  );
  for (const status of failed.slice(0, 12)) {
    limitations.push(
      `Exa could not extract ${status.id ?? "a requested URL"} (status: ${status.status}).`,
    );
  }
  for (const requested of requestedUrls) {
    const normalized = normalizeHttpUrl(requested);
    if (normalized && !seen.has(normalized)) {
      // Do not duplicate a status-based limitation for the same URL.
      if (
        !failed.some((status) => status.id && normalized === normalizeHttpUrl(status.id))
      ) {
        limitations.push(`Exa returned no extractable content for ${normalized}.`);
      }
    }
  }
  return { pages, limitations: limitations.slice(0, 12) };
}

export async function getExaContents(
  urls: string[],
  options?: {
    signal?: AbortSignal;
    client?: ExaContentsClientLike;
  },
): Promise<{ pages: ExaPage[]; limitations: string[] }> {
  throwIfAborted(options?.signal);
  // Lazy client load keeps this module importable in plain node:test
  // (exa-client.server.ts pulls in `server-only`). Tests inject a mock.
  const client =
    options?.client ??
    (await import("./exa-client.server.ts")).getExaClient();
  const unique = [...new Set(urls.map((url) => normalizeHttpUrl(url)).filter(Boolean))] as string[];
  if (unique.length === 0) {
    throw new Error("No valid HTTP(S) URLs supplied for Exa contents.");
  }

  const timeout = AbortSignal.timeout(EXA_CONTENTS_TIMEOUT_MS);
  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  throwIfAborted(signal);

  const response = (await client.getContents(unique.slice(0, 10), {
    highlights: true,
  })) as unknown as ExaContentsResponseLike;

  throwIfAborted(signal);
  return mapExaContentsResponse(response, unique);
}
