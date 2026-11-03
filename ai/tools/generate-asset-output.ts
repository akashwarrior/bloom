import { z } from "zod";

import { getAssetIdFromUrl } from "../../lib/assets.ts";
import { toolErrorSchema } from "./schemas.ts";

const generatedAssetSuccessSchema = z.object({
  status: z.literal("success"),
  name: z.string().min(1).max(61),
  url: z.string().startsWith("/api/assets/"),
  localPath: z.string().startsWith("/bloom-generated-assets/"),
});

const generatedAssetFailureSchema = z.strictObject({
  status: z.literal("error"),
  name: z.string().min(1).max(61),
  error: toolErrorSchema,
});

const generatedAssetResultSchema = z.discriminatedUnion("status", [
  generatedAssetSuccessSchema,
  generatedAssetFailureSchema,
]);

export const generateAssetOutputSchema = z.union([
  z.strictObject({ assets: z.array(generatedAssetResultSchema) }),
  z.strictObject({ error: toolErrorSchema }),
]);

export type GeneratedAssetResult = z.infer<typeof generatedAssetResultSchema>;

type ModelAssetResult =
  | (Omit<Extract<GeneratedAssetResult, { status: "success" }>, "url"> & {
    assetId?: string;
  })
  | Extract<GeneratedAssetResult, { status: "error" }>;

/**
 * Model-facing result. The chat preview URL is dropped so it can never reach
 * site code; the project-local browser path stays available.
 */
export function buildModelAssetResult(
  asset: GeneratedAssetResult,
): ModelAssetResult {
  if (asset.status === "error") return asset;

  const assetId = getAssetIdFromUrl(asset.url);
  return {
    status: "success" as const,
    name: asset.name,
    ...(assetId ? { assetId } : {}),
    localPath: asset.localPath,
  };
}
