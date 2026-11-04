import assert from "node:assert/strict";
import test from "node:test";

import { contrastRatio, deltaE, parseColor } from "../lib/design/color.ts";
import {
  buildPageDna,
  surfacesFromFrames,
  type DesignProfile,
  type FrameAnalysis,
} from "../lib/design/dna.ts";

function frame(scrollY: number, colors: string[], height = 1000): FrameAnalysis {
  return {
    scrollY,
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

function profile(): DesignProfile {
  return {
    stickyHeaderHeight: 0,
    textStyles: [
      { family: "Display Face", size: 160, weight: 400, transform: "uppercase", chars: 30 },
      { family: "Sans Face", size: 32, weight: 400, transform: "none", chars: 400 },
      { family: "Text Face", size: 16, weight: 400, transform: "none", chars: 3000 },
    ],
    headings: [],
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
  });
  assert.equal(dna.theme, "mixed");
  assert.equal(dna.type.display?.family, "Display Face");
  assert.equal(dna.type.body?.family, "Text Face");

  const dark = buildPageDna({
    frames: [frame(0, ["#0B1020", "#0B1020", "#0B1020", "#0B1020"])],
    profile: null,
    pageHeight: 1000,
  });
  assert.equal(dark.theme, "dark");
});

test("hashed next/font family names become readable catalog names", async () => {
  const { readableFamily } = await import("../lib/design/dna.ts");
  assert.equal(readableFamily("__wixMadeforDisplay_a50bae"), "Wix Madefor Display");
  assert.equal(readableFamily("__Inter_Fallback_5e1c2a"), "Inter");
  assert.equal(readableFamily("MMPolyVariable"), "MMPolyVariable");
});
