import assert from "node:assert/strict";
import test from "node:test";

import { BuildSession, type ReferenceCapture } from "../ai/build-session.ts";
import { designBriefSchema, type DesignBrief } from "../lib/design/brief.ts";
import { applyPrimaryReferenceDefaults, genericLookProblems, primaryReferenceProblems, structureProblems } from "../lib/design/brief-checks.ts";
import { buildPageDna, compareWithPrimaryReference, glyphOnlyContrast, heroImagery, type FrameAnalysis, type PageDna } from "../lib/design/dna.ts";

function frame(scrollY: number, shares: number[], color = "#F5F3FF"): FrameAnalysis {
  return {
    scrollY, width: 1920, height: 1080,
    bands: shares.map((share) => ({ color, share, edgeColor: color, edgeShare: 0.95 })),
    palette: [{ color, share: 0.6 }],
  };
}

function dna(theme: "light" | "dark", display: number): PageDna {
  const base = buildPageDna({ frames: [], profile: null, pageHeight: 6000, viewportHeight: 1080 });
  return {
    ...base,
    theme,
    lightShare: theme === "light" ? 0.95 : 0.02,
    surfaceColors: [{ color: theme === "light" ? "#F5F3FF" : "#111111", share: 0.9, light: theme === "light" }],
    palette: [{ color: theme === "light" ? "#F5F3FF" : "#111111", share: 0.7 }, { color: "#AB9FF2", share: 0.1 }],
    type: { ...base.type, display: { family: "Phantom", size: display, weight: 500, lineHeight: 1, letterSpacing: 0, uppercase: false } },
  };
}

const phantom: ReferenceCapture = {
  url: "https://phantom.com/", host: "phantom.com", brand: "phantom", title: "Phantom",
  pageHeight: 9000, viewportHeight: 1080, dna: dna("light", 96), dnaText: "",
  frames: [{ number: 1, assetId: "a", assetUrl: "/api/assets/a", scrollY: 0, scrollPercentage: 0 }],
  headings: [], largeMedia: 1, heroImagery: 0.7, frameNotes: {}, fonts: [],
};

function brief(overrides: Partial<DesignBrief> = {}, hero: Partial<DesignBrief["sections"][number]> = {}): DesignBrief {
  return designBriefSchema.parse({
    anchor: { url: phantom.url, keep: "Rounded art card hero on a pale canvas with large type" },
    traits: [], brand: { name: "Halo", tagline: "Money that moves with you", voice: "Warm and direct" },
    theme: "light",
    colors: {
      background: "#F7F4EE", foreground: "#14110F", primary: "#14110F", primaryForeground: "#FFFFFF",
      accent: "#C2410C", accentForeground: "#FFFFFF", muted: "#ECE6DA", mutedForeground: "#4A443D", border: "#DDD5C6",
      surfaces: [{ name: "canvas", background: "#F7F4EE", foreground: "#14110F" }],
    },
    typography: {
      display: { family: "Bricolage Grotesque", weight: 600, sizePx: 96, lineHeight: 1, tracking: -0.03, uppercase: false },
      heading: { sizePx: 48, weight: 600 }, body: { family: "Inter", weight: 400, sizePx: 17 }, mono: null,
    },
    shape: { cardRadiusPx: 32, buttonShape: "pill", shadows: "none", borders: false },
    layout: { contentWidthPx: 1440, sectionPaddingPx: 120 },
    signature: "A rounded media card of ribbon artwork in the brand palette behind a centered headline",
    imagery: "Abstract ribbon artwork, matte paper texture, warm terracotta and ink",
    sections: [
      { id: "hero", block: "custom", variant: null, surface: 1, purpose: "Lead with the promise", composition: "Centered headline over a full-width rounded art card", media: "abstract ribbon artwork filling the card", anchorFrame: 1, ...hero },
      { id: "move", block: "custom", variant: null, surface: 1, purpose: "Show sending money", composition: "Tall colored cards in a row", media: null, anchorFrame: null },
      { id: "security", block: "custom", variant: null, surface: 1, purpose: "Explain self custody", composition: "Two column statement", media: null, anchorFrame: null },
      { id: "footer", block: "custom", variant: null, surface: 1, purpose: "Links", composition: "Rounded footer card", media: null, anchorFrame: null },
    ],
    ...overrides,
  });
}

function session() {
  const value = new BuildSession("site");
  value.recordReference(phantom);
  value.designStudy = {
    audience: "People who want a calm wallet for everyday money",
    thesis: "A pale editorial canvas where one bold artwork card carries the brand",
    references: [{ url: phantom.url, frame: 1, observation: "A pale canvas frames a wide rounded artwork card under a centered display headline.", principle: "One dominant artwork card creates the focal point.", adaptation: "Use a terracotta ribbon artwork card with a centered headline for the wallet hero.", avoid: "Do not reuse Phantom's artwork, headline or claims." }],
    hero: { composition: "Centered headline above a wide rounded artwork card", focalPoint: "The artwork card", mobile: "The card becomes a tall crop below the headline and button." },
    rhythm: "Follow the hero with tall colored cards, then a calm security statement.",
  };
  return value;
}

test("a brief that keeps the primary reference's theme, scale and art-led hero is accepted", () => {
  assert.deepEqual(primaryReferenceProblems(brief(), session(), phantom), []);
  assert.deepEqual(genericLookProblems(brief(), session()), []);
});

test("the observed failure is rejected: dark violet glass page, 56px Space Grotesk and a UI-card hero", () => {
  const failed = brief({
    theme: "dark",
    colors: {
      background: "#09090B", foreground: "#FAFAFA", primary: "#7E22CE", primaryForeground: "#FFFFFF",
      accent: "#4F46E5", accentForeground: "#FFFFFF", muted: "#18181B", mutedForeground: "#A1A1AA", border: "#27272A",
      surfaces: [{ name: "canvas", background: "#09090B", foreground: "#FAFAFA" }],
    },
    typography: {
      display: { family: "Space Grotesk", weight: 700, sizePx: 56, lineHeight: 1.15, tracking: -0.02, uppercase: false },
      heading: { sizePx: 32, weight: 600 }, body: { family: "Inter", weight: 400, sizePx: 16 }, mono: null,
    },
    signature: "Luminous glassmorphic wallet cards floating on obsidian dark surfaces with indigo-to-violet gradient borders",
  }, { media: "Interactive wallet app UI preview with live tickers", anchorFrame: null });
  const reference = primaryReferenceProblems(failed, session(), phantom).join("\n");
  assert.match(reference, /measured as a light page/);
  assert.match(reference, /96px; 56px loses its scale/);
  assert.match(reference, /anchorFrame/);
  assert.match(reference, /led by artwork or photography/);
  const generic = genericLookProblems(failed, session()).join("\n");
  assert.match(generic, /glassmorphic|luminous|gradient border/);
  assert.match(generic, /Space Grotesk/);
  assert.match(generic, /near-black page with a (?:violet|purple)/);
});

test("explicit user wishes override the theme and palette defaults", () => {
  const dark = brief({
    theme: "dark",
    colors: {
      background: "#0A0A0C", foreground: "#FAFAFA", primary: "#7E22CE", primaryForeground: "#FFFFFF",
      accent: "#7E22CE", accentForeground: "#FFFFFF", muted: "#18181B", mutedForeground: "#A1A1AA", border: "#27272A",
      surfaces: [{ name: "canvas", background: "#0A0A0C", foreground: "#FAFAFA" }],
    },
  });
  const wished = session();
  wished.requestText = "build a dark purple crypto wallet landing page";
  assert.equal(wished.requestedTheme, "dark");
  assert.ok(!primaryReferenceProblems(dark, wished, phantom).some((problem) => problem.includes("theme family")));
  assert.deepEqual(genericLookProblems(dark, wished), []);
});

test("a tagline lifted from a reference title is rejected", () => {
  const value = session();
  value.references[0]!.headings = ["696PP", "Independent Design & Motion Studio"];
  const copied = brief({ brand: { name: "Atelier Vane", tagline: "Independent Design & Motion Studio", voice: "Calm" } });
  assert.match(genericLookProblems(copied, value).join("\n"), /repeats a reference site's words/);
  assert.deepEqual(genericLookProblems(brief(), value), []);
});

test("the primary reference must be the one analysed in the study", () => {
  const value = session();
  value.designStudy = { ...value.designStudy!, references: [] };
  assert.match(primaryReferenceProblems(brief(), value, phantom).join("\n"), /primary reference you analysed/);
});

test("measured preview gaps catch theme flips, small type and missing hero artwork", () => {
  const preview = { ...dna("dark", 56), lightShare: 0.03 };
  const gaps = compareWithPrimaryReference({ preview, previewHeroImagery: 0.05, reference: phantom, requestedTheme: null });
  assert.deepEqual(gaps.map((gap) => gap.severity), ["blocking", "major", "major"]);
  assert.deepEqual(compareWithPrimaryReference({ preview: { ...dna("light", 92) }, previewHeroImagery: 0.6, reference: phantom, requestedTheme: null }), []);
  assert.equal(compareWithPrimaryReference({ preview, previewHeroImagery: 0.6, reference: phantom, requestedTheme: "dark" }).filter((gap) => gap.severity === "blocking").length, 0);
});

test("hero imagery is measured from the first frame's non-flat bands", () => {
  const art = frame(0, [0.95, 0.3, 0.25, 0.2, 0.3, 0.95]);
  const flat = frame(0, [0.95, 0.9, 0.85, 0.9, 0.9, 0.95]);
  assert.equal(heroImagery([frame(1080, [0.95]), art]), 0.67);
  assert.equal(heroImagery([flat]), 0);
  assert.equal(heroImagery([]), 0);
  const viewport = { width: 1920, height: 1080 };
  const video = [{ kind: "video", placements: [{ bounds: [227, 152, 1466, 796] as const }, { bounds: [227, 2191, 468, 626] as const }] }];
  assert.equal(heroImagery([flat], video, viewport), 0.56);
  assert.ok(heroImagery([flat], [{ kind: "image", placements: [{ bounds: [285, 1057, 1350, 997] as const }] }], viewport) < 0.05);
  assert.equal(heroImagery([flat], [{ kind: "mask", placements: [{ bounds: [0, 0, 1920, 1080] as const }] }], viewport), 0);
});

test("decorative single glyphs are separated from unreadable copy", () => {
  assert.equal(glyphOnlyContrast({ count: 1, examples: [{ text: "Ξ", color: "#4338CA", background: "#18181B", ratio: 2.2, y: 10 }] }), true);
  assert.equal(glyphOnlyContrast({ count: 2, examples: [{ text: "Ξ", color: "#4338CA", background: "#18181B", ratio: 2.2, y: 10 }] }), false);
  assert.equal(glyphOnlyContrast({ count: 1, examples: [{ text: "Download", color: "#333", background: "#222", ratio: 1.2, y: 10 }] }), false);
});

test("fields the primary reference determines are filled instead of rejected", () => {
  const omitted = brief({
    typography: {
      display: { family: "Bricolage Grotesque", weight: 600, sizePx: 60, lineHeight: 1, tracking: -0.03, uppercase: false },
      heading: { sizePx: 48, weight: 600 }, body: { family: "Inter", weight: 400, sizePx: 17 }, mono: null,
    },
  }, { media: null, anchorFrame: null });
  const imageRich = { ...phantom, largeMedia: 12 };
  const value = session();
  value.references.splice(0, 1, imageRich);
  const { brief: fixed, notes } = applyPrimaryReferenceDefaults(omitted, value);
  assert.equal(fixed.sections[0]!.anchorFrame, 1);
  assert.match(fixed.sections[0]!.media!, /generated text-free artwork/);
  assert.equal(fixed.typography.display.sizePx, 72);
  assert.ok(fixed.sections.filter((section) => section.media).length >= 2);
  assert.equal(notes.length, 4);
  assert.deepEqual(primaryReferenceProblems(fixed, value, imageRich), []);
  assert.equal(omitted.sections[0]!.media, null);
  assert.deepEqual(applyPrimaryReferenceDefaults(brief(), new BuildSession("clone", phantom.url)).notes, []);
});

test("the generic landing skeleton is rejected unless the primary reference has those sections", () => {
  const notes = {
    1: "Centered massive headline above a wide rounded artwork card on a pale canvas.",
    2: "Three tall colored cards in a horizontal carousel, each with a short headline and product illustration.",
    3: "Giant serif statement centered on a pale background with a download button.",
  };
  const value = session();
  value.references[0]!.frameNotes = notes;
  value.references[0]!.frames = [1, 2, 3].map((number) => ({ number, assetId: `a${number}`, assetUrl: `/api/assets/a${number}`, scrollY: (number - 1) * 1000, scrollPercentage: (number - 1) * 50 }));
  const section = (id: string, composition: string, anchorFrame: number | null, block = "custom") => ({ id, block, variant: null, surface: 1, purpose: `The ${id} section`, composition, media: null, anchorFrame });
  const skeleton = brief({
    sections: [
      section("hero", "Centered headline above a rounded art card", 1),
      section("networks", "Horizontal ticker of supported networks", null),
      section("features", "Three icon cards in a row", 2),
      section("how-it-works", "Three numbered steps", null),
      section("faq", "Accordion of questions", null),
      section("footer", "Links and legal notes", null),
    ],
  });
  const problems = structureProblems(skeleton, value).join("\n");
  assert.match(problems, /not mapped to phantom\.com frames/);
  assert.match(problems, /"networks" is a generic logo or network ticker/);
  assert.match(problems, /"faq" is a generic FAQ/);
  assert.match(problems, /"how-it-works" is a generic numbered steps/);
  assert.doesNotMatch(problems, /"features"/);
  const followed = brief({
    sections: [
      section("hero", "Centered headline above a rounded art card", 1),
      section("move-money", "Three tall colored cards in a carousel with product illustrations", 2),
      section("statement", "Giant serif statement with a download button", 3),
      section("footer", "Links and legal notes", null),
    ],
  });
  assert.deepEqual(structureProblems(followed, value), []);
  value.references[0]!.frameNotes = {};
  assert.ok(!structureProblems(skeleton, value).some((problem) => problem.includes("generic")));
});
