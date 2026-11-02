import assert from "node:assert/strict";
import test from "node:test";
import type Exa from "exa-js";

import {
  getExaContents,
  mapExaContentsResponse,
} from "../lib/exa-contents.ts";

type ContentsClient = Pick<Exa, "getContents">;

function asContentsClient(
  client: {
    getContents: (urls: unknown, options: unknown) => Promise<unknown>;
  },
): ContentsClient {
  return client as unknown as ContentsClient;
}

test("maps highlights to summary/sections and surfaces status failures", () => {
  const response = {
    results: [
      {
        title: "Phantom Docs",
        url: "https://phantom.com/docs",
        highlights: ["Install the extension.", "Create a wallet."],
      },
    ],
    statuses: [
      { id: "https://phantom.com/docs", status: "success" },
      { id: "https://broken.example.com/", status: "error" },
    ],
  };
  const { pages, limitations } = mapExaContentsResponse(response, [
    "https://phantom.com/docs",
    "https://broken.example.com/",
  ]);
  assert.equal(pages.length, 1);
  assert.equal(pages[0]?.url, "https://phantom.com/docs");
  assert.match(pages[0]?.summary ?? "", /Install the extension/);
  assert.equal(pages[0]?.sections.length, 2);
  assert.equal(limitations.length, 1);
  assert.match(limitations[0] ?? "", /broken\.example\.com/);
});

test("reports requested URLs with no extractable content", () => {
  const { pages, limitations } = mapExaContentsResponse(
    { results: [] },
    ["https://example.com/missing"],
  );
  assert.equal(pages.length, 0);
  assert.equal(limitations.length, 1);
  assert.match(limitations[0] ?? "", /example\.com\/missing/);
});

test("getExaContents sends top-level highlights (not nested)", async () => {
  const calls: Array<{ urls: unknown; options: unknown }> = [];
  const client = asContentsClient({
    getContents: async (urls: unknown, options: unknown) => {
      calls.push({ urls, options });
      return { results: [], statuses: [] };
    },
  });
  await getExaContents(
    ["https://example.com/a", "https://example.com/a"],
    { client },
  );
  assert.equal(calls.length, 1);
  // Deduped to a single URL.
  assert.deepEqual(calls[0]?.urls, ["https://example.com/a"]);
  // Contents-endpoint shape: top-level highlights, never { contents: {...} }.
  assert.deepEqual(calls[0]?.options, { highlights: true });
});

test("getExaContents rejects non-HTTP URLs and aborted signals", async () => {
  const client = asContentsClient({
    getContents: async () => ({ results: [] }),
  });
  await assert.rejects(getExaContents(["not a url"], { client }), /No valid/);
  await assert.rejects(
    getExaContents(["https://example.com/"], {
      client,
      signal: AbortSignal.abort(new Error("cancelled")),
    }),
    /cancelled/,
  );
});
