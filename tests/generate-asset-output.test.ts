import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModelAssetResult,
  generateAssetOutputSchema,
} from "../ai/tools/generate-asset-output.ts";

const assetId = "6f0c8d2e-8a1b-4c3d-8e9f-0a1b2c3d4e5f";
const url = `/api/assets/${assetId}`;
const localPath = "/bloom-generated-assets/hero-orbit.png";

test("model result keeps the local path, drops the preview URL, and omits absent placement", () => {
  const placed = buildModelAssetResult({
    status: "success",
    name: "hero-orbit",
    url,
    localPath,
    placedIn: ["app/page.tsx"],
  });

  assert.deepEqual(placed, {
    status: "success",
    name: "hero-orbit",
    assetId,
    localPath,
    placedIn: ["app/page.tsx"],
  });
  assert.equal("url" in placed, false);

  const unplaced = buildModelAssetResult({
    status: "success",
    name: "hero-orbit",
    url,
    localPath,
  });
  assert.deepEqual(unplaced, {
    status: "success",
    name: "hero-orbit",
    assetId,
    localPath,
  });
});

test("model result keeps per-asset errors", () => {
  const error = {
    code: "ASSET_GENERATION_FAILED",
    message: "The provider rejected the request",
    recovery: "Use a different subject.",
  };
  assert.deepEqual(
    buildModelAssetResult({
      status: "error",
      name: "work-chair",
      error,
    }),
    {
      status: "error",
      name: "work-chair",
      error,
    },
  );
});

test("output schema accepts per-asset results and batch rejection", () => {
  const output = generateAssetOutputSchema.parse({
    assets: [
      {
        status: "success",
        name: "hero-orbit",
        url,
        localPath,
      },
      {
        status: "error",
        name: "work-chair",
        error: { code: "ASSET_GENERATION_FAILED", message: "Failed" },
      },
    ],
  });

  if (!("assets" in output)) {
    throw new Error("Expected an asset batch");
  }
  assert.equal(output.assets.length, 2);

  assert.doesNotThrow(() =>
    generateAssetOutputSchema.parse({
      error: { code: "ASSET_BATCH_REJECTED", message: "Duplicate name" },
    }),
  );
  assert.throws(() =>
    generateAssetOutputSchema.parse({ status: "success", assets: [] }),
  );
});
