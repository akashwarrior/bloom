import assert from "node:assert/strict";
import test from "node:test";

import { BuildSession } from "../ai/build-session.ts";
import {
  DesignPass,
  MAX_INSPIRATION_BATCHES,
  type InspirationFrame,
} from "../ai/design/design-pass.ts";

function frame(number: number, imageId: string, batch: number): InspirationFrame {
  return {
    number,
    imageId,
    batch,
    assetId: `asset-${number}`,
    assetUrl: `/api/assets/asset-${number}`,
  };
}

test("only new projects require an applied design", () => {
  assert.equal(new BuildSession().requiresDesign, false);
  assert.equal(new BuildSession({ requiresDesign: true }).requiresDesign, true);
});

test("image placeholders stay pending until an asset can replace them", () => {
  const session = new BuildSession();
  session.trackAssetSlots(
    "app/page.tsx",
    '<img src="asset:hero-water" className="aspect-video" alt="Water" />',
  );

  assert.deepEqual(
    session.pendingAssetSlots().map((slot) => ({
      name: slot.name,
      aspect: slot.aspect,
      paths: slot.paths,
    })),
    [{ name: "hero-water", aspect: "16:9", paths: ["app/page.tsx"] }],
  );
  assert.equal(
    session.resolveAssetSlots('<img src="asset:hero-water" />'),
    '<img src="asset:hero-water" />',
  );

  session.recordGeneratedAsset({
    name: "hero-water",
    localPath: "/bloom-generated-assets/hero-water.png",
  });
  assert.equal(
    session.resolveAssetSlots('<img src="asset:hero-water" />'),
    '<img src="/bloom-generated-assets/hero-water.png" />',
  );

  session.trackAssetSlots(
    "app/page.tsx",
    '<img src="/bloom-generated-assets/hero-water.png" />',
  );
  assert.deepEqual(session.pendingAssetSlots(), []);
});

test("each source edit invalidates both previews until they are captured again", () => {
  const session = new BuildSession();
  assert.equal(session.hasEdits, false);
  assert.equal(session.previewIsCurrent("desktop"), false);
  assert.equal(session.previewIsCurrent("mobile"), false);

  session.recordEdit();
  session.recordPreview("desktop");
  assert.equal(session.previewIsCurrent("desktop"), true);
  assert.equal(session.previewIsCurrent("mobile"), false);

  session.recordPreview("mobile");
  assert.equal(session.previewIsCurrent("desktop"), true);
  assert.equal(session.previewIsCurrent("mobile"), true);

  session.recordEdit();
  assert.equal(session.hasEdits, true);
  assert.equal(session.previewIsCurrent("desktop"), false);
  assert.equal(session.previewIsCurrent("mobile"), false);
});

test("page tracking remembers the last page route edited in the run", () => {
  const session = new BuildSession();
  assert.equal(session.lastPagePath, null);

  session.recordPagePath("components/hero.tsx", true);
  assert.equal(session.lastPagePath, null);

  session.recordPagePath("app/page.tsx", true);
  assert.equal(session.lastPagePath, "app/page.tsx");

  session.recordPagePath("app/dashboard/page.tsx", true);
  assert.equal(session.lastPagePath, "app/dashboard/page.tsx");

  session.recordPagePath("app/dashboard/page.tsx", false);
  assert.equal(session.lastPagePath, null);
});

test("a design pass numbers frames globally and a retry starts a fresh budget", () => {
  const pass = new DesignPass();
  pass.recordBatch([frame(1, "alpha", 1), frame(2, "beta", 1)]);
  pass.recordBatch([frame(3, "gamma", 2)]);

  assert.equal(pass.totalFrames, 3);
  assert.equal(pass.remainingBatches, MAX_INSPIRATION_BATCHES - 2);
  assert.deepEqual([...pass.seen].sort(), ["alpha", "beta", "gamma"]);
  assert.deepEqual(pass.allFrames().map((entry) => entry.number), [1, 2, 3]);

  const retry = new DesignPass();
  assert.equal(retry.totalFrames, 0);
  assert.equal(retry.remainingBatches, MAX_INSPIRATION_BATCHES);
  assert.deepEqual([...retry.seen], []);
});
