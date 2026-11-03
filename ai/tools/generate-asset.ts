import { cropArtwork } from "@/ai/crop-artwork";
import { generationPrompt } from "@/ai/asset-prompt";
import { getAssetIdFromUrl } from "@/lib/assets";
import { createHash } from "node:crypto";
import sharp from "sharp";

import { tool } from "ai";

import { generateProjectImage } from "@/ai/image-generation";
import { directionColors } from "@/ai/design/direction";
import type { ToolParams } from "@/ai/tools";
import {
  generateAssetInputSchema,
  validateGenerateAssetInput,
  type AssetInput,
} from "@/ai/tools/generate-asset-input";
import {
  buildModelAssetResult,
  generateAssetOutputSchema,
  type GeneratedAssetResult,
} from "@/ai/tools/generate-asset-output";
import { toolError } from "@/ai/tools/schemas";
import {
  findGeneratedProjectAsset,
  resolveGeneratedImageForModel,
  storeGeneratedProjectAsset,
  type ProjectGeneratedImageMediaType,
} from "@/ai/generated-assets.server";
import { modelAssetFilename } from "@/ai/context/asset-reference";
import { materializeGeneratedProjectAssets } from "@/lib/runtime/runtime-service.server";

function placementSurfaceColor(session: ToolParams["session"], token: string | null) {
  const direction = session.appliedDirection;
  return direction && token ? directionColors(direction)[token] ?? null : null;
}

function assetFailure(
  name: string,
  code: string,
  error: unknown,
  recovery: string,
): GeneratedAssetResult {
  return {
    status: "error",
    name,
    error: toolError(code, error, recovery),
  };
}

async function generateOneAsset({
  projectId,
  signal,
  logger,
  session,
  asset,
  assetIndex,
  readReference,
}: {
  projectId: string;
  signal: AbortSignal;
  logger: ToolParams["logger"];
  session: ToolParams["session"];
  asset: AssetInput;
  assetIndex: number;
  readReference: (url: string) => ReturnType<typeof resolveGeneratedImageForModel>;
}): Promise<GeneratedAssetResult> {
  const useConceptContext = !asset.crop && asset.reference_url === null && Boolean(session.conceptUrl);
  const sourceUrl = asset.reference_url === "none" ? null
    : asset.reference_url ?? session.conceptUrl ?? (asset.crop ? session.appliedConceptUrl : null);
  const input = { ...asset, reference_url: sourceUrl };

  try {
    const text = generationPrompt(
      input,
      placementSurfaceColor(session, input.placement_surface),
      useConceptContext,
      session.appliedDirection?.imagery ?? null,
    );
    const cacheKey = createHash("sha256").update(JSON.stringify({ ...input, prompt: text })).digest("hex").slice(0, 24);
    const cached = await findGeneratedProjectAsset({ projectId, cacheKey });
    const generated = cached ?? await (async () => {
      const reference = input.reference_url ? await readReference(input.reference_url) : null;
      if (input.crop) {
        if (!reference) throw new Error("Choose a source image before extracting its artwork.");
        const bytes = await cropArtwork(reference.data, input.crop);
        return storeGeneratedProjectAsset({
          projectId, cacheKey, suggestedName: input.name, bytes, mediaType: "image/png",
        });
      }
      const { image } = await generateProjectImage({
        prompt: reference ? { images: [reference.data], text } : text,
        aspectRatio: input.aspect_ratio,
        abortSignal: signal,
      }, assetIndex, logger);
      return storeGeneratedProjectAsset({
        projectId,
        cacheKey,
        suggestedName: input.name,
        mediaType: image.mediaType as ProjectGeneratedImageMediaType,
        bytes: image.uint8Array,
      });
    })();

    await logger.write("generate_asset.completed", {
      assetId: generated.assetId,
      name: input.name,
      mediaType: generated.mediaType,
      localPath: generated.localPath,
      assetIndex,
      cached: Boolean(cached),
    });

    return {
      status: "success",
      name: input.name,
      url: generated.previewUrl,
      localPath: generated.localPath,
    };
  } catch (error) {
    await logger.write("generate_asset.failed", { assetIndex, error });
    return assetFailure(
      input.name,
      "ASSET_GENERATION_FAILED",
      error,
      input.reference_url && !input.crop
        ? `Generation failed for "${input.name}". If the source already contains suitable artwork, extract its region with crop. Otherwise reuse an existing photo or simplify the section.`
        : `Check the source and crop for "${input.name}", reuse a suitable existing asset, or simplify the section.`,
    );
  }
}

export const generateAsset = ({
  projectId,
  signal,
  logger,
  session,
  writer,
}: Pick<ToolParams, "projectId" | "signal" | "logger" | "session" | "writer">) =>
  tool({
    description:
      "Generate images in a batch or crop artwork from a project image. Describe each subject, composition, crop, lighting, and materials. The project's imagery direction from DESIGN.md is applied to every new image automatically, so describe this image, not the style. Specify colors in the prompt when they matter to the artwork. Use placement_surface to match a flat UI background. Insert each chosen image into the project source using its returned localPath as the image src or CSS URL. Build interface controls and text in code.",
    inputSchema: generateAssetInputSchema,
    outputSchema: generateAssetOutputSchema,
    execute: async (input, { toolCallId }) => {
      const problem = validateGenerateAssetInput(input);
      if (problem) {
        await logger.write("generate_asset.rejected", { reason: problem });
        return {
          error: toolError(
            "ASSET_BATCH_REJECTED",
            new Error(problem),
            "Resubmit with unique kebab-case names.",
          ),
        };
      }

      try {
        await logger.write("generate_asset.batch_started", { batchSize: input.assets.length });
        const references = new Map<string, ReturnType<typeof resolveGeneratedImageForModel>>();
        const readReference = (url: string) => {
          let pending = references.get(url);
          if (!pending) {
            pending = resolveGeneratedImageForModel(projectId, url, true);
            references.set(url, pending);
          }
          return pending;
        };
        let processed = 0;
        const assets = await Promise.all(
          input.assets.map(async (asset, assetIndex) => {
            const result = await generateOneAsset({
              projectId,
              signal,
              logger,
              session,
              asset,
              assetIndex,
              readReference,
            });
            writer.write({
              type: "data-asset-progress",
              id: toolCallId,
              data: { toolCallId, processed: ++processed, total: input.assets.length },
            });
            return result;
          }),
        );
        const assetIds = assets.flatMap((asset) =>
          asset.status === "success" ? getAssetIdFromUrl(asset.url) ?? [] : [],
        );
        if (assetIds.length) {
          try {
            await materializeGeneratedProjectAssets(projectId, assetIds, signal);
          } catch (error) {
            await logger.write("generate_asset.materialize_failed", { error });
            return {
              assets: assets.map((asset) => asset.status === "error" ? asset : assetFailure(
                asset.name,
                "ASSET_MATERIALIZATION_FAILED",
                error,
                "The image was generated but could not be installed in the project runtime. Retry this batch to reuse cached images.",
              )),
            };
          }
        }
        return { assets };
      } catch (error) {
        await logger.write("generate_asset.batch_failed", { error });
        return {
          error: toolError(
            "ASSET_GENERATION_FAILED",
            error,
            "Inspect the failure, then use a suitable existing image, crop project artwork, or simplify the section.",
          ),
        };
      }
    },
    toModelOutput: async ({ input, output }) => {
      if ("error" in output) {
        return {
          type: "text" as const,
          value: JSON.stringify({ error: output.error }),
        };
      }

      const summaries: Array<Record<string, unknown>> = output.assets.map(
        (asset) => ({ ...buildModelAssetResult(asset) }),
      );
      const imageParts = await Promise.all(
        output.assets.map(async (asset, index) => {
          if (asset.status === "error") return null;

          try {
            const resolved = await resolveGeneratedImageForModel(
              projectId,
              asset.url,
            );
            if (resolved.mediaType === "image/svg+xml") return null;

            const image = sharp(resolved.data);
            const { autoOrient, hasAlpha } = await image.metadata();
            summaries[index].width = autoOrient.width;
            summaries[index].height = autoOrient.height;
            if (input.assets.some(request => request.name === asset.name && request.transparent)) {
              const opaque = !hasAlpha || (await image.stats()).isOpaque;
              summaries[index].transparency = opaque
                ? "Opaque. The background is part of the image and will cover anything underneath."
                : "Contains transparent pixels.";
            }
            return {
              type: "file" as const,
              data: { type: "data" as const, data: resolved.data },
              mediaType: resolved.mediaType,
              filename: modelAssetFilename(
                resolved.assetId,
                resolved.filename,
              ),
            };
          } catch (error) {
            summaries[index] = {
              ...summaries[index],
              previewDeliveryError:
                error instanceof Error ? error.message : String(error),
            };
            return null;
          }
        }),
      );

      return {
        type: "content" as const,
        value: [
          {
            type: "text" as const,
            text: JSON.stringify({ assets: summaries }),
          },
          ...imageParts.filter((part) => part !== null),
        ],
      };
    },
  });
