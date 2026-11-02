import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import {
  colorProblems,
  designDirectionSchema,
  directionColors,
  directionDigest,
  fontLoading,
  fontThemeLines,
  proofProblems,
  resolveFont,
  resolveFonts,
  storedDirection,
  studyPrompt,
  type FontCatalog,
} from "../ai/design/direction.ts";
import { directionInput } from "./fixtures/direction.ts";

const catalog = JSON.parse(readFileSync(
  createRequire(import.meta.url).resolve("next/dist/compiled/@next/font/dist/google/font-data.json"),
  "utf8",
)) as FontCatalog;

const direction = storedDirection(directionInput);

test("a direction is free-form but complete: every part of the design is decided", () => {
  assert.equal(designDirectionSchema.safeParse(directionInput).success, true);
  for (const key of ["concept", "signature", "composition", "mobile", "color", "typography", "shape", "imagery", "motion", "voice", "avoid", "explored"] as const) {
    assert.equal(designDirectionSchema.safeParse({ ...directionInput, [key]: undefined }).success, false, `${key} must be required`);
  }
  // Any color, any color name and any family are accepted by the schema; nothing is chosen from a fixed list.
  const other = structuredClone(directionInput);
  other.color.palette = [{ name: "plum", value: "#7A1FA2", on: "#FFFFFF", use: "The only color besides canvas and ink." }];
  other.typography.display.family = "Some Face Nobody Listed";
  assert.equal(designDirectionSchema.safeParse(other).success, true);
  assert.equal(designDirectionSchema.safeParse({ ...directionInput, color: { ...directionInput.color, canvas: "tomato" } }).success, false);
  // The fixed token slots of a component library are gone: a direction that sends them is not a direction.
  assert.equal(designDirectionSchema.safeParse({ ...directionInput, color: { ...directionInput.color, tokens: { primary: "#E8B04A" } } }).success, false);
});

test("illegible color pairs and mode mismatches are reported as facts to fix", () => {
  assert.deepEqual(colorProblems(directionInput.color), []);

  const faint = structuredClone(directionInput.color);
  faint.ink = "#3A5148";
  faint.palette[2]!.value = "#1B332B";
  const problems = colorProblems(faint);
  assert.equal(problems.length, 2);
  assert.match(problems[0]!, /ink #3A5148 on canvas #10231C has contrast [\d.]+:1; text needs at least 4\.5:1/);
  assert.match(problems[1]!, /palette "ink-soft": text #10231C on #1B332B has contrast/);

  const wrongMode = { ...directionInput.color, mode: "light" as const };
  assert.match(colorProblems(wrongMode)[0]!, /color\.mode is "light" but canvas #10231C is dark/);

  const twice = structuredClone(directionInput.color);
  twice.palette.push({ name: "brass", value: "#E8B04A", on: "#10231C", use: "The same name again." }, { name: "ink", value: "#F2EDE3", on: "#10231C", use: "Collides with the default text." });
  const named = colorProblems(twice);
  assert.ok(named.some((problem) => /"brass" is used twice/.test(problem)));
  assert.ok(named.some((problem) => /"ink" is used twice/.test(problem)));
});

test("fonts resolve against the whole Google catalog, with exact feedback when they cannot load", () => {
  assert.ok(Object.keys(catalog).length > 1_000);

  const variable = resolveFont({ family: "fraunces", italic: true, fallback: "serif" }, catalog);
  assert.ok("font" in variable);
  assert.deepEqual(variable.font, { family: "Fraunces", importName: "Fraunces", weights: null, styles: ["normal", "italic"], subsets: ["latin"], fallback: "serif" });

  const fixed = resolveFont({ family: "DM Mono", weights: [400, 500, 800], fallback: "monospace" }, catalog);
  assert.ok("font" in fixed);
  assert.equal(fixed.font.importName, "DM_Mono");
  assert.deepEqual(fixed.font.weights, ["400", "500"]);

  const defaulted = resolveFont({ family: "Bebas Neue", fallback: "sans-serif" }, catalog);
  assert.ok("font" in defaulted);
  assert.deepEqual(defaulted.font.weights, ["400"]);

  const missing = resolveFont({ family: "Hanken Grotesque", fallback: "sans-serif" }, catalog);
  assert.ok("problem" in missing);
  assert.match(missing.problem, /not a Google Fonts family/);
  assert.match(missing.problem, /Hanken Grotesk/);

  const badWeight = resolveFont({ family: "Bebas Neue", weights: [700], fallback: "sans-serif" }, catalog);
  assert.ok("problem" in badWeight);
  assert.match(badWeight.problem, /has no weight 700\. Available weights: 400/);

  const all = resolveFonts({ ...directionInput.typography, body: { family: "Helvetica Now", fallback: "sans-serif" } }, catalog);
  assert.ok("problems" in all);
  assert.match(all.problems[0]!, /^typography\.body: /);
});

test("a direction is saved as decisions: its colors by name and its fonts ready to load, with no generated stylesheet", () => {
  const fonts = resolveFonts(direction.typography, catalog);
  assert.ok("fonts" in fonts);

  assert.deepEqual(directionColors(direction), {
    canvas: "#10231C", ink: "#F2EDE3", panel: "#16302A", brass: "#E8B04A", "ink-soft": "#B7C4BC", rule: "#2C4A41", signal: "#FF5A36",
  });

  const source = fontLoading(fonts.fonts);
  assert.match(source, /import \{ Fraunces, Hanken_Grotesk, DM_Mono \} from "next\/font\/google";/);
  assert.match(source, /const display = Fraunces\(\{ subsets: \["latin"\], variable: "--display-font", display: "swap", style: \["normal","italic"\] \}\);/);
  assert.match(source, /const utility = DM_Mono\(\{ .*weight: \["400","500"\] \}\);/);
  assert.match(source, /On <html>: className=\{`\$\{display\.variable\} \$\{body\.variable\} \$\{utility\.variable\}`\}/);
  assert.deepEqual(fontThemeLines(fonts.fonts), [
    "--font-display: var(--display-font), serif;",
    "--font-body: var(--body-font), sans-serif;",
    "--font-utility: var(--utility-font), monospace;",
  ]);
});

test("earlier directions are summarized so a new project can steer away from them", () => {
  const digest = directionDigest(direction);
  assert.match(digest, /^concept: A tide archive/);
  assert.match(digest, /type: Fraunces \/ Hanken Grotesk \/ DM Mono/);
  assert.match(digest, /color: dark; canvas #10231C, text #F2EDE3, palette #16302A #E8B04A #B7C4BC #2C4A41 #FF5A36/);
  assert.ok(digest.length < 900);
});

test("a direction cannot plan for proof the builder would have to invent", () => {
  assert.deepEqual(proofProblems(directionInput, "language learning website"), []);
  const planned = {
    ...directionInput,
    composition: `${directionInput.composition} Under the two buttons sits an avatar + rating row, and before pricing a band of 3-column testimonials with a logo wall.`,
  };
  const [problem, ...rest] = proofProblems(planned, "language learning website");
  assert.deepEqual(rest, []);
  assert.match(problem!, /"testimonials" in composition/);
  assert.match(problem!, /"logo wall" in composition/);
  assert.match(problem!, /the builder is not allowed to invent them/);
  // Proof the user asked for or supplied is theirs to show.
  assert.deepEqual(proofProblems(planned, "landing page with our customer testimonials: 'Great' — Ana"), []);
  // Ordinary words that only resemble proof are left alone.
  assert.deepEqual(proofProblems({ ...directionInput, concept: `${directionInput.concept} The page proves the method with a waterproof field notebook.` }, "x"), []);
});

test("the first screen is rendered from the director's decisions, not from the bare request", () => {
  const prompt = studyPrompt(direction, "a site for a field notebook");
  for (const decided of [
    direction.concept, direction.signature, direction.composition, direction.imagery,
    direction.typography.display.family, direction.typography.body.family,
    direction.color.canvas, direction.color.palette[1]!.value, direction.avoid[0]!,
  ]) {
    assert.ok(prompt.includes(decided), `the study brief is missing: ${decided.slice(0, 40)}`);
  }
  assert.match(prompt, /User request: a site for a field notebook/);
  assert.match(prompt, /Leave out invented endorsements, ratings, awards and customer counts\./);
  assert.doesNotMatch(studyPrompt(direction, "  "), /User request/);
});
