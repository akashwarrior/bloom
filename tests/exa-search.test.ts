import assert from "node:assert/strict";
import test from "node:test";
import type Exa from "exa-js";

import {
  mapExaSearchResults,
  searchExa,
} from "../lib/exa-search.ts";

type SearchClient = Pick<Exa, "search">;

function asSearchClient(
  client: { search: (query: string, options: unknown) => Promise<unknown> },
): SearchClient {
  return client as unknown as SearchClient;
}

test("maps highlights to snippets, dedupes, and limits", () => {
  const response = {
    results: [
      {
        title: "Phantom Wallet",
        url: "https://phantom.com/",
        highlights: ["Self-custodial Solana wallet.", "Second highlight."],
      },
      {
        title: "Phantom Wallet duplicate",
        url: "https://phantom.com/",
        highlights: ["Duplicate URL."],
      },
      { title: "", url: "https://rainbow.me/en/", highlights: [] as string[], text: "Fun Ethereum wallet with full page text." },
      { title: "Bad", url: "ftp://example.com/x", highlights: ["Skipped."] },
    ],
  };
  const rows = mapExaSearchResults(response, "crypto wallets", 10);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.url, "https://phantom.com/");
  assert.equal(rows[0]?.title, "Phantom Wallet");
  assert.match(rows[0]?.snippet ?? "", /Self-custodial/);
  // Empty title falls back to URL, empty highlights fall back to text.
  assert.equal(rows[1]?.url, "https://rainbow.me/en/");
  assert.equal(rows[1]?.title, "https://rainbow.me/en/");
  assert.match(rows[1]?.snippet ?? "", /Fun Ethereum/);
});

test("falls back to query placeholder when no content", () => {
  const rows = mapExaSearchResults(
    { results: [{ title: "T", url: "https://example.com/" }] },
    "my query",
    5,
  );
  assert.equal(rows[0]?.snippet, 'Web result for "my query".');
});

test("searchExa sends the recommended request shape", async () => {
  const calls: Array<{ query: string; options: unknown }> = [];
  const client = asSearchClient({
    search: async (query: string, options: unknown) => {
      calls.push({ query, options });
      return { results: [] };
    },
  });
  await searchExa("latest developments in LLMs", 6, { client });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.query, "latest developments in LLMs");
  assert.deepEqual(calls[0]?.options, {
    type: "auto",
    numResults: 6,
    contents: { highlights: true },
  });
});

test("searchExa clamps limit and respects abort", async () => {
  const client = asSearchClient({
    search: async () => {
      throw new Error("should not be called");
    },
  });
  await assert.rejects(
    searchExa("q", 3, {
      client,
      signal: AbortSignal.abort(new Error("cancelled")),
    }),
    /cancelled/,
  );
});
