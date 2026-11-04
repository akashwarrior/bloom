import assert from "node:assert/strict";
import test from "node:test";

import { decodePreset, PRESET_FONTS } from "shadcn/preset";

import { parseColor, parseOklch, toHex } from "../lib/design/color.ts";
import { findCatalogFont } from "../lib/design/fonts.ts";
import {
  compatibleShadcnTheme,
  randomShadcnTheme,
  shadcnPresetCode,
} from "../lib/design/shadcn-theme.ts";
import { FONT_OPTIONS, optionLabel } from "../lib/design/theme-options.ts";

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

test("random presets follow shadcn create's randomize biases", () => {
  const random = seeded(7);
  for (let index = 0; index < 400; index += 1) {
    const theme = randomShadcnTheme(random);
    assert.notEqual(theme.baseColor, "gray");
    if (theme.style === "lyra") {
      assert.equal(theme.font, "jetbrains-mono");
      assert.equal(theme.radius, "none");
    }
    if (theme.style === "rhea") assert.notEqual(theme.radius, "large");
    if (theme.theme === "blue") assert.ok(["orange", "yellow"].includes(theme.chartColor));
  }
});

test("preset codes round-trip through shadcn's decoder", () => {
  const theme = randomShadcnTheme(seeded(3));
  const decoded = decodePreset(shadcnPresetCode(theme))!;
  for (const key of ["style", "baseColor", "theme", "chartColor", "font", "fontHeading", "iconLibrary", "radius", "menuAccent", "menuColor"] as const) {
    assert.equal(decoded[key], theme[key]);
  }
});

test("oklch values from shadcn themes convert to sRGB", () => {
  assert.equal(toHex(parseOklch("oklch(1 0 0)")!), "#FFFFFF");
  const blue = parseOklch("oklch(0.546 0.245 262.881)")!;
  const expected = parseColor("#155DFC")!;
  for (const channel of ["r", "g", "b"] as const) assert.ok(Math.abs(blue[channel] - expected[channel]) <= 2);
  assert.equal(parseOklch("#ffffff"), null);
});

test("every shadcn create font resolves to a catalog font", () => {
  for (const font of PRESET_FONTS) assert.ok(findCatalogFont(optionLabel(FONT_OPTIONS, font)), font);
});

test("a neutral theme or chart color must match the base color, as shadcn init requires", () => {
  const theme = { ...randomShadcnTheme(() => 0), baseColor: "mist", theme: "mauve", chartColor: "taupe" } as const;
  const { theme: fixed, notes } = compatibleShadcnTheme(theme);
  assert.equal(fixed.theme, "mist");
  assert.equal(fixed.chartColor, "mist");
  assert.equal(notes.length, 2);
  assert.deepEqual(compatibleShadcnTheme({ ...theme, theme: "blue", chartColor: "mist" }).notes, []);
  for (let index = 0; index < 400; index += 1) {
    const drawn = randomShadcnTheme();
    assert.deepEqual(compatibleShadcnTheme(drawn).notes, [], JSON.stringify(drawn));
  }
});
