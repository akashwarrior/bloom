import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { BuildSession, type ReferenceCapture } from "../ai/build-session.ts";
import { designBriefSchema } from "../lib/design/brief.ts";
import { genericLookProblems, primaryReferenceProblems, structureProblems } from "../lib/design/brief-checks.ts";
import { buildPageDna } from "../lib/design/dna.ts";
import { LIBRARY_HEADLINES, LIBRARY_TEXT } from "../lib/design/library/copy.ts";
import { PATTERNS, drawCandidates, findPattern } from "../lib/design/library/patterns.ts";
import { lintSourceChange } from "../lib/design/lint.ts";
import { LIBRARY_URL, validateDesignStudy } from "../lib/design/study.ts";

const IMAGES = path.join(import.meta.dirname, "..", "lib", "design", "library", "images");

test("every library pattern has unique id and existing example images, and every image is used", () => {
  assert.equal(new Set(PATTERNS.map((pattern) => pattern.id)).size, PATTERNS.length);
  const used = new Set<string>();
  for (const pattern of PATTERNS) {
    assert.ok(pattern.examples.length >= 1, pattern.id);
    for (const example of pattern.examples) {
      assert.ok(existsSync(path.join(IMAGES, `${example}.webp`)), `${pattern.id}: ${example}.webp`);
      used.add(example);
    }
  }
  const files = readdirSync(IMAGES).filter((file) => file.endsWith(".webp")).map((file) => file.replace(/\.webp$/, ""));
  assert.deepEqual(files.filter((file) => !used.has(file)), []);
});

test("each build draws a different random slate of candidates per role, and every role can fill its slate", () => {
  const first = drawCandidates(() => 0.5);
  for (const [role, ids] of Object.entries(first)) {
    assert.equal(new Set(ids).size, ids.length, role);
    for (const id of ids) assert.ok(findPattern(id)!.roles.includes(role as "hero"), `${id} is not a ${role}`);
  }
  assert.deepEqual([first.hero.length, first.section.length, first.close.length], [6, 10, 4]);
  let seed = 1;
  const seeded = () => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const slates = Array.from({ length: 6 }, () => JSON.stringify(drawCandidates(seeded())));
  assert.ok(new Set(slates).size > 1);
  for (const pattern of PATTERNS) assert.ok(pattern.notFor.length > 10, pattern.id);
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
  assert.deepEqual(kinds('<button type="button">x</button>', "components/blocks/more.tsx"), []);
});

function libraryReference(ids: string[]): ReferenceCapture {
  const patterns = ids.map((id) => findPattern(id)!);
  const frameNotes = Object.fromEntries(patterns.map((pattern, index) => [index + 1, `${pattern.name} [${pattern.id}]: ${pattern.composition}`]));
  return {
    url: LIBRARY_URL, host: "library.bloom", brand: "bloom-design-library", title: "Bloom design library",
    pageHeight: 1080 * ids.length, viewportHeight: 1080,
    dna: { ...buildPageDna({ frames: [], profile: null, pageHeight: 1080, viewportHeight: 1080 }), theme: "mixed", lightShare: 0.5 },
    dnaText: "", headings: [], fonts: [], frameNotes,
    frames: patterns.map((_, index) => ({ number: index + 1, assetId: `l${index}`, assetUrl: `/api/assets/l${index}`, scrollY: 0, scrollPercentage: 0 })),
    largeMedia: patterns.filter((pattern) => pattern.heroImagery >= 0.35).length,
    heroImagery: patterns[0]!.heroImagery,
  };
}

const section = (id: string, composition: string, anchorFrame: number | null, media: string | null = null) =>
  ({ id, block: "custom", variant: null, surface: 1, purpose: `The ${id} section`, composition, media, anchorFrame });

function walletBrief(sections: ReturnType<typeof section>[], display = { family: "Inter Tight", weight: 400 }) {
  return designBriefSchema.parse({
    anchor: { url: LIBRARY_URL, keep: "One crisp product card resting on a watercolor panel" },
    traits: [], brand: { name: "Tidewater", tagline: "Money that keeps its own pace", voice: "Calm and exact" },
    theme: "light",
    colors: {
      background: "#F4F2EE", foreground: "#141414", primary: "#141414", primaryForeground: "#FFFFFF",
      accent: "#2F6B4F", accentForeground: "#FFFFFF", muted: "#E8E5DF", mutedForeground: "#55524C", border: "#DAD6CE",
      surfaces: [{ name: "canvas", background: "#F4F2EE", foreground: "#141414" }],
    },
    typography: {
      display: { ...display, sizePx: 88, lineHeight: 1, tracking: -0.03, uppercase: false },
      heading: { sizePx: 44, weight: 450 }, body: { family: "Inter", weight: 400, sizePx: 16 }, mono: { family: "JetBrains Mono" },
    },
    shape: { cardRadiusPx: 20, buttonShape: "pill", shadows: "soft", borders: true },
    layout: { contentWidthPx: 1280, sectionPaddingPx: 120 },
    signature: "A single send card resting on a watercolor estuary panel",
    imagery: "Watercolor estuary at dusk, soft paper grain, muted greens and warm grays",
    sections,
  });
}

function librarySession(reference: ReferenceCapture) {
  const session = new BuildSession("site");
  session.recordReference(reference);
  session.libraryPatterns = ["art-stage", "product-vignettes", "mono-diagram"];
  return session;
}

test("the library frames act as the single primary reference for an original site", () => {
  const reference = libraryReference(["art-stage", "product-vignettes", "mono-diagram"]);
  const session = librarySession(reference);
  assert.equal(session.requiredReferences(), 1);
  const study = {
    audience: "People who move money between their own accounts every week",
    thesis: "A calm wallet shown as one exact card resting on painted water",
    references: [1, 2].map((frame) => ({ url: LIBRARY_URL, frame, observation: "A full-bleed painted panel holds one centered product card at a third of its width.", principle: "Art carries mood while one exact card proves the product.", adaptation: "An estuary watercolor with the send card resting on it.", avoid: "Do not reuse the example artwork or its interface copy." })),
    hero: { composition: "Watercolor panel with one send card centered on it", focalPoint: "The send card on the painting", mobile: "The panel becomes a tall crop with the card overlapping its lower edge." },
    rhythm: "Art panel, then a pair of exact product vignettes on gray, then a dashed monospace diagram on near-black.",
  };
  assert.deepEqual(validateDesignStudy(study, session.references), []);
  session.designStudy = study;

  const followed = walletBrief([
    section("hero", "Watercolor panel edge to edge with one send card centered", 1, "watercolor estuary painting filling the hero panel"),
    section("vignettes", "Two exact product cards side by side on a gray stage", 2),
    section("principle", "Dashed monospace box with a two-column table", 3),
    section("footer", "Small links", null),
  ]);
  assert.deepEqual(primaryReferenceProblems(followed, session, reference), []);
  assert.deepEqual(structureProblems(followed, session), []);
  assert.deepEqual(genericLookProblems(followed, session), []);

  const skeleton = walletBrief([
    section("hero", "Watercolor panel with one send card", 1, "watercolor estuary painting filling the hero panel"),
    section("faq", "Accordion of questions", 2),
    section("how-it-works", "Three numbered steps", null),
    section("footer", "Small links", null),
  ]);
  const problems = structureProblems(skeleton, session).join("\n");
  assert.match(problems, /"faq" is a generic FAQ/);
  assert.match(problems, /"how-it-works" is a generic numbered steps/);
});

test("an art-led library hero must plan its art; a regular-weight grotesk display is allowed but a heavy one is not", () => {
  const reference = libraryReference(["art-stage", "product-vignettes"]);
  const session = librarySession(reference);
  const uiHero = walletBrief([
    section("hero", "Grid of wallet cards", 1, "wallet app UI cards"),
    section("vignettes", "Two exact product cards side by side", 2),
    section("footer", "Small links", null),
  ]);
  assert.match(primaryReferenceProblems(uiHero, session, reference).join("\n"), /at most one product card may rest on it/);
  const heavy = walletBrief([
    section("hero", "Watercolor panel with one send card", 1, "watercolor estuary painting filling the panel"),
    section("vignettes", "Two exact product cards side by side", 2),
    section("footer", "Small links", null),
  ], { family: "Inter", weight: 700 });
  assert.match(genericLookProblems(heavy, session).join("\n"), /"Inter" at weight 700/);
});

test("words from the library images cannot be reused on a generated page", () => {
  const reference = { ...libraryReference(["split-art-hero", "editorial-list"]), headings: [...LIBRARY_HEADLINES, ...Object.values(LIBRARY_TEXT).flatMap((lines) => [...lines, lines.join(" ")])] };
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
