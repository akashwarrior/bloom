import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ASSETS_PER_CALL,
  generateAssetInputSchema,
  validateGenerateAssetInput,
} from "../ai/tools/generate-asset-input.ts";

function parse(assets: unknown[]) {
  return generateAssetInputSchema.parse({ assets });
}

test("applies defaults to a batch", () => {
  const input = parse([
    {
      name: "hero-orbit",
      prompt: "A chrome orb on a flat background",
    },
  ]);

  assert.equal(input.assets[0]?.aspect_ratio, "1:1");
  assert.equal(input.assets[0]?.transparent, false);
  assert.equal(input.assets[0]?.placement_surface, null);
  assert.equal(input.assets[0]?.prompt, "A chrome orb on a flat background");
  assert.equal(validateGenerateAssetInput(input), null);
});

test("requires a prompt and unique names", () => {
  assert.throws(() =>
    parse([{ name: "empty" }]),
  );
  assert.throws(() =>
    parse([{ name: "empty", prompt: "   " }]),
  );

  const duplicateNames = parse([
    { name: "same", prompt: "One" },
    { name: "same", prompt: "Two" },
  ]);
  assert.match(
    validateGenerateAssetInput(duplicateNames) ?? "",
    /must be unique/,
  );
});

test("enforces kebab-case names and the batch limit", () => {
  assert.throws(() =>
    parse([{ name: "Hero Orbit", prompt: "x" }]),
  );
  assert.throws(() => parse([]));
  assert.throws(() =>
    parse(
      Array.from({ length: MAX_ASSETS_PER_CALL + 1 }, (_, index) => ({
        name: `asset-${index}`,
        prompt: "x",
      })),
    ),
  );

  const input = parse(
    Array.from({ length: MAX_ASSETS_PER_CALL }, (_, index) => ({
      name: `asset-${index}`,
      prompt: "x",
    })),
  );
  assert.equal(input.assets.length, MAX_ASSETS_PER_CALL);
  assert.equal(validateGenerateAssetInput(input), null);
});

test("asset prompts preserve framing and transparency over a placement surface", async () => {
  const { generationPrompt } = await import("../ai/asset-prompt.ts");
  const input = generateAssetInputSchema.parse({ assets: [{ name: "hero", prompt: "Tin on the right with room for the headline" }] }).assets[0]!;
  const surface = "#ff0088";
  assert.doesNotMatch(generationPrompt(input, null), /brand palette|flat background/i);
  assert.match(generationPrompt(input, surface), /Tin on the right/);
  assert.match(generationPrompt(input, surface), /#ff0088/);
  const transparent = generationPrompt({ ...input, transparent: true }, surface);
  assert.match(transparent, /transparent background/);
  assert.doesNotMatch(transparent, /flat background|cropped close/);
});
