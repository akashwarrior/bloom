import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { BuildSession, type ReferenceCapture } from "../ai/build-session.ts";
import { DesignPass, MAX_INSPIRATION_BATCHES } from "../ai/design/design-pass.ts";
import { buildPageDna } from "../lib/design/dna.ts";
import { LIBRARY_HEADLINES, LIBRARY_TEXT } from "../lib/design/library/copy.ts";
import {
  drawLibraryFrames,
  LIBRARY_FRAME_COUNT,
  LIBRARY_URL,
  libraryImageIds,
} from "../lib/design/library/frames.ts";
import { lintSourceChange } from "../lib/design/lint.ts";

const IMAGES = path.join(import.meta.dirname, "..", "lib", "design", "library", "images");

test("the image library is discovered from disk and sampled without replacement", () => {
  const ids = libraryImageIds();
  const files = readdirSync(IMAGES, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".webp"));
  assert.ok(ids.length > 0);
  assert.equal(ids.length, files.length);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(existsSync(path.join(IMAGES, `${id}.webp`)), `${id}.webp`);

  const expected = Math.min(LIBRARY_FRAME_COUNT, ids.length);
  const frames = drawLibraryFrames();
  assert.equal(frames.length, expected);
  assert.equal(new Set(frames).size, frames.length);
  for (const id of frames) assert.ok(ids.includes(id));

  const excluded = new Set(frames.slice(0, 2));
  const fresh = drawLibraryFrames(4, () => 0.5, IMAGES, excluded);
  assert.ok(fresh.every((id) => !excluded.has(id)));
  assert.equal(new Set(fresh).size, fresh.length);

  assert.equal(new DesignPass().totalFrames, 0);
  assert.equal(new DesignPass().remainingBatches, MAX_INSPIRATION_BATCHES);

  let seed = 1;
  const seeded = () => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (expected > 1) {
    const samples = Array.from({ length: 6 }, () => JSON.stringify(drawLibraryFrames(LIBRARY_FRAME_COUNT, seeded())));
    assert.ok(new Set(samples).size > 1);
  }
});

test("library discovery follows files on disk without a naming manifest", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "bloom-library-"));
  try {
    for (const name of ["2.webp", "10.webp", "editorial-cover.webp", "notes.txt"]) {
      writeFileSync(path.join(directory, name), "");
    }
    mkdirSync(path.join(directory, "nested.webp"));

    assert.deepEqual(libraryImageIds(directory), ["2", "10", "editorial-cover"]);
    const sampled = drawLibraryFrames(10, () => 0.5, directory);
    assert.deepEqual([...sampled].sort(), ["10", "2", "editorial-cover"]);
    assert.equal(drawLibraryFrames(2, () => 0.5, directory).length, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("hand-rolled controls are flagged in favor of shadcn components", () => {
  const kinds = (after: string, path = "components/hero.tsx") =>
    lintSourceChange({ path, before: null, after, reference: null }).map((violation) => violation.kind);
  assert.ok(kinds('<button className="rounded-full bg-primary px-4">Start</button>').includes("hand-rolled-ui"));
  assert.ok(kinds('<input type="email" className="h-10" />').includes("hand-rolled-ui"));
  assert.ok(kinds('<table className="w-full">').includes("hand-rolled-ui"));
  assert.ok(kinds('<a href="/start" className="inline-flex rounded-full bg-primary px-5 py-2">Start</a>').includes("hand-rolled-ui"));
  assert.deepEqual(kinds('<Button render={<a href="/start" />} nativeButton={false}>Start</Button>'), []);
  assert.deepEqual(kinds('<InputGroup><Input placeholder="you@company.com" /></InputGroup>'), []);
  assert.deepEqual(kinds('<a href="/docs" className="underline underline-offset-4">Read the docs</a>'), []);
});

function libraryReference(): ReferenceCapture {
  return {
    url: LIBRARY_URL, host: "library.bloom", brand: "bloom-design-library",
    dna: { ...buildPageDna({ frames: [], profile: null, pageHeight: 1080 }), theme: "mixed", lightShare: 0.5 },
    headings: [],
  };
}

function librarySession(reference: ReferenceCapture) {
  const session = new BuildSession();
  session.recordReference(reference);
  return session;
}

test("words from the library images cannot be reused on a generated page", () => {
  const reference = { ...libraryReference(), headings: [...LIBRARY_HEADLINES, ...Object.values(LIBRARY_TEXT).flatMap((lines) => [...lines, lines.join(" ")])] };
  const session = librarySession(reference);
  const copy = session.referenceCopy();
  const lint = (line: string) => lintSourceChange({ path: "components/hero.tsx", before: null, after: `<h1>${line}</h1>`, reference: copy }).map((violation) => violation.kind);
  assert.ok(lint("Swaps for wallets").includes("copied-copy"));
  assert.ok(lint("Good design is not a service. It is a decision.").includes("copied-copy"));
  assert.ok(lint("Private design direction that becomes part of how you build").includes("copied-copy"));
  assert.ok(lint("Route via Flashnet in one tap").includes("reference-brand"));
  assert.deepEqual(lint("Tidewater moves your savings between accounts on your schedule"), []);
});

test("certifications and accuracy claims nobody provided are flagged", () => {
  const lint = (line: string) => lintSourceChange({ path: "components/close.tsx", before: null, after: `<p>${line}</p>`, reference: null }).map((violation) => violation.kind);
  assert.ok(lint("No credit card required · SOC2 Type II Certified").includes("invented-stat"));
  assert.ok(lint("99.9% accuracy on technical terms").includes("invented-stat"));
  assert.ok(lint("Zero training on client transcripts (SOC2 Type II verified)").includes("invented-stat"));
  assert.ok(lint("Join product teams saving 8+ hours every week").includes("invented-stat"));
  assert.deepEqual(lint("Notes land in your tracker after every call"), []);
});
