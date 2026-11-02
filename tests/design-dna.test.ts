import assert from "node:assert/strict";
import test from "node:test";

import { contrastRatio, deltaE, parseColor } from "../lib/design/color.ts";
import {
  buildPageDna,
  compareDna,
  formatDna,
  surfacesFromFrames,
  type DesignProfile,
  type FrameAnalysis,
} from "../lib/design/dna.ts";

function frame(scrollY: number, colors: string[], height = 1000): FrameAnalysis {
  return {
    scrollY,
    width: 1920,
    height,
    bands: colors.map((color) => ({
      color,
      share: 0.9,
      edgeColor: color,
      edgeShare: 0.95,
    })),
    palette: [...new Set(colors)].map((color) => ({
      color,
      share: colors.filter((entry) => entry === color).length / colors.length,
    })),
  };
}

function profile(overrides: Partial<DesignProfile> = {}): DesignProfile {
  return {
    viewportWidth: 1920,
    viewportHeight: 1000,
    pageHeight: 4000,
    stickyHeaderHeight: 0,
    textStyles: [
      { family: "Display Face", size: 160, weight: 400, lineHeight: 160, letterSpacing: 0, transform: "uppercase", color: "rgb(229, 255, 195)", chars: 30, headingChars: 30, tags: ["h1"] },
      { family: "Sans Face", size: 32, weight: 400, lineHeight: 42, letterSpacing: 0, transform: "none", color: "rgb(10, 10, 10)", chars: 400, headingChars: 300, tags: ["h2"] },
      { family: "Text Face", size: 16, weight: 400, lineHeight: 24, letterSpacing: 0, transform: "none", color: "rgb(10, 10, 10)", chars: 3000, headingChars: 0, tags: ["p"] },
    ],
    headings: [],
    buttons: [
      { shape: "pill", radius: 999, height: 48, background: "rgb(10, 10, 10)", color: "rgb(255, 255, 255)", border: false, weight: 500, transform: "none", count: 6 },
    ],
    cards: { count: 8, radiusMedian: 32, shadowShare: 0, borderShare: 0 },
    contentWidth: 1440,
    sectionCount: 6,
    images: { count: 4, broken: 0 },
    overflowX: 0,
    rootFamilies: { body: "\"Text Face\", sans-serif", h1: "\"Display Face\", sans-serif" },
    loadedFontFamilies: ["Display Face"],
    ...overrides,
  };
}

test("color helpers parse, compare, and measure contrast", () => {
  assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor("rgb(1, 51, 48)"), { r: 1, g: 51, b: 48 });
  assert.equal(parseColor("rgba(0, 0, 0, 0)"), null);
  assert.ok(deltaE(parseColor("#E5FFC3")!, parseColor("#E6FFC4")!) < 2);
  assert.ok(contrastRatio(parseColor("#000000")!, parseColor("#FFFFFF")!) > 20);
});

test("surfaces follow the color-blocked rhythm across overlapping frames", () => {
  const frames = [
    frame(0, ["#013330", "#013330", "#013330", "#013330"]),
    frame(900, ["#013330", "#E5FFC3", "#E5FFC3", "#E5FFC3"]),
    frame(1800, ["#E5FFC3", "#CCE7FF", "#CCE7FF", "#CCE7FF"]),
    frame(2700, ["#CCE7FF", "#FFA680", "#FFA680", "#FFFFFF"]),
  ];
  const surfaces = surfacesFromFrames(frames, 3700);
  assert.deepEqual(
    surfaces.map((surface) => surface.color),
    ["#013330", "#E5FFC3", "#CCE7FF", "#FFA680", "#FFFFFF"],
  );
  assert.equal(surfaces[0]!.start, 0);
  assert.ok(surfaces.at(-1)!.end <= 3700);
});

test("page DNA classifies themes and typography roles", () => {
  const dna = buildPageDna({
    frames: [
      frame(0, ["#013330", "#013330", "#013330", "#013330"]),
      frame(1000, ["#E5FFC3", "#E5FFC3", "#CCE7FF", "#CCE7FF"]),
      frame(2000, ["#FFA680", "#FFA680", "#FFFFFF", "#FFFFFF"]),
    ],
    profile: profile(),
    pageHeight: 3000,
    viewportHeight: 1000,
  });
  assert.equal(dna.theme, "mixed");
  assert.equal(dna.type.display?.family, "Display Face");
  assert.equal(dna.type.display?.uppercase, true);
  assert.equal(dna.type.body?.family, "Text Face");
  assert.equal(dna.ui.buttonShape, "pill");
  const text = formatDna(dna, "metamask.io");
  assert.match(text, /Surface rhythm/);
  assert.match(text, /Display: "Display Face" 160px/);

  const dark = buildPageDna({
    frames: [frame(0, ["#0B1020", "#0B1020", "#0B1020", "#0B1020"])],
    profile: null,
    pageHeight: 1000,
    viewportHeight: 1000,
  });
  assert.equal(dark.theme, "dark");
});

test("comparison reports theme, color-blocking, type, and font gaps with measured values", () => {
  const anchor = buildPageDna({
    frames: [
      frame(0, ["#013330", "#013330", "#E5FFC3", "#E5FFC3"]),
      frame(1000, ["#CCE7FF", "#CCE7FF", "#FFA680", "#FFA680"]),
      frame(2000, ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF"]),
    ],
    profile: profile(),
    pageHeight: 9000,
    viewportHeight: 1000,
  });
  const previewProfile = profile({
    textStyles: [
      { family: "Geist", size: 72, weight: 800, lineHeight: 76, letterSpacing: 0, transform: "none", color: "rgb(255,255,255)", chars: 40, headingChars: 40, tags: ["h1"] },
      { family: "Geist", size: 16, weight: 400, lineHeight: 24, letterSpacing: 0, transform: "none", color: "rgb(200,200,200)", chars: 2000, headingChars: 0, tags: ["p"] },
    ],
    rootFamilies: { body: "Geist, sans-serif", h1: "Geist, sans-serif" },
  });
  const preview = buildPageDna({
    frames: [
      frame(0, ["#0B1020", "#0B1020", "#0B1020", "#0B1020"]),
      frame(1000, ["#0B1020", "#0B1020", "#0B1020", "#0B1020"]),
    ],
    profile: previewProfile,
    pageHeight: 2000,
    viewportHeight: 1000,
  });
  const gaps = compareDna({
    preview,
    previewProfile,
    anchor,
    expected: {
      theme: "mixed",
      surfaceColors: ["#0F3D2E", "#E8FFD0", "#D6ECFF", "#FFB592"],
      displaySize: 150,
      displayFamily: "Dela Gothic One",
      bodyFamily: "Hanken Grotesk",
    },
  });
  const messages = gaps.map((gap) => gap.message).join("\n");
  assert.match(messages, /Color-blocking is missing/);
  assert.match(messages, /Off-brief surface color #0B1020/);
  assert.match(messages, /Display type is too small: the largest headline renders at 72px/);
  assert.match(messages, /h1 renders in Geist/);
  assert.match(messages, /page is thin/);
});

test("hashed next/font family names become readable catalog names", async () => {
  const { readableFamily } = await import("../lib/design/dna.ts");
  assert.equal(readableFamily("__wixMadeforDisplay_a50bae"), "Wix Madefor Display");
  assert.equal(readableFamily("__Inter_Fallback_5e1c2a"), "Inter");
  assert.equal(readableFamily("MMPolyVariable"), "MMPolyVariable");
});
