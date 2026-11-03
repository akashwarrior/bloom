import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { cropArtwork } from "../ai/crop-artwork.ts";

test("a normalized artwork crop retains the selected source pixels", async () => {
  const bytes = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
    raw: { width: 2, height: 1, channels: 3 },
  }).png().toBuffer();
  const cropped = await cropArtwork(bytes, { left: 500, top: 0, right: 1000, bottom: 1000 });
  assert.deepEqual([...await sharp(cropped).raw().toBuffer()], [0, 255, 0]);
  await assert.rejects(cropArtwork(bytes, { left: 500, top: 0, right: 400, bottom: 1000 }), /positive width/);
});
