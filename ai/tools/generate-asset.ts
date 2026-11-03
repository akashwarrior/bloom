import { createHash } from "node:crypto";

import { generateImage, tool } from "ai";

import { getImageModelOptions } from "@/ai/config";
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
} from "@/lib/generated-assets.server";
import { describeColor, parseColor } from "@/lib/design/color";
import { modelAssetFilename } from "@/lib/model-asset-reference";
import {
  applyProjectChanges,
  captureProjectSourceSnapshot,
  materializeGeneratedProjectAssets,
} from "@/lib/runtime/runtime-service.server";

/**
 * Image providers rate-limit bursts more aggressively than they rate-limit the
 * total number of requests. Generate one image at a time and leave a short gap
 * between starts so a batch does not open with several simultaneous requests.
 */
const MAX_CONCURRENT_GENERATIONS = 1;
const MIN_GENERATION_START_GAP_MS = 1_000;

let activeGenerations = 0;
let nextGenerationStart = 0;
const generationQueue: Array<() => void> = [];

/** Image providers rate-limit bursts; parallel tool calls share one slot. */
async function withGenerationSlot<T>(run: () => Promise<T>) {
  if (activeGenerations >= MAX_CONCURRENT_GENERATIONS) {
    await new Promise<void>((resolve) => generationQueue.push(resolve));
  }
  activeGenerations += 1;
  try {
    const waitMs = nextGenerationStart - Date.now();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    nextGenerationStart = Date.now() + MIN_GENERATION_START_GAP_MS;
    return await run();
  } finally {
    activeGenerations -= 1;
    generationQueue.shift()?.();
  }
}

type ThemeContext = {
  palette: string;
  surfaceColor: string | null;
};

function generationPrompt(
  input: AssetInput,
  context: ThemeContext | null = null,
) {
  const contextInstructions = context
    ? [
      `Color palette: ${context.palette}. Stay within these colors.`,
      "Render clean, physically plausible lighting and materials. Do not add glows, neon, holographic sheen, lens flares, particle sparkles, or floating light streaks even if the request mentions them.",
      context.surfaceColor
        ? `Background: a perfectly flat, uniform, plain ${context.surfaceColor} filling the entire canvas edge to edge, with no vignette, gradient, texture, floor, or cast background shadow.`
        : null,
    ].filter(Boolean).join("\n")
    : "";

  return [
    "Generate exactly one production-ready visual asset for a website implementation.",
    "Create an original asset from the prompt.",
    `Aspect ratio: ${input.aspect_ratio}.`,
    context?.surfaceColor
      ? ""
      : input.transparent
        ? "Use a genuinely transparent background and keep the subject cleanly isolated for layering."
        : "Use only the background treatment explicitly described in the request. If none is described, do not invent scenery or decorative effects; use a simple solid background appropriate to the asset's role.",
    contextInstructions,
    input.prompt ? `Request: ${input.prompt}` : "",
    !input.transparent
      ? "Compose it like a hero shot: the main subject is large and dominant, filling most of the frame and cropped close, never a small object floating in empty space."
      : "",
    "Do not add a presentation frame, browser mockup, caption, watermark, gradient, glow, shadow, texture, or unrelated decoration unless it is explicitly described in the request.",
  ].filter(Boolean).join("\n");
}

function assetCacheKey(
  input: AssetInput,
  context: ThemeContext | null,
) {
  return createHash("sha256")
    .update(JSON.stringify({
      ...input,
      context,
    }))
    .digest("hex")
    .slice(0, 24);
}

async function generateRaster({
  input,
  context,
  signal,
  logger,
}: {
  input: AssetInput;
  context: ThemeContext | null;
  signal: AbortSignal;
  logger: ToolParams["logger"];
}) {
  const { image } = await generateImage({
    ...getImageModelOptions(logger),
    prompt: generationPrompt(input, context),
    n: 1,
    aspectRatio: input.aspect_ratio,
    abortSignal: signal,
  });

  return {
    bytes: image.uint8Array,
    mediaType: image.mediaType as ProjectGeneratedImageMediaType,
  };
}

function themeContext(
  session: ToolParams["session"],
  surfaceToken: string | null,
): ThemeContext | null {
  const theme = session.appliedDesign?.theme;
  if (!theme) return null;

  const vars = theme.resolved.vars;

  const tokenColor = (token: string | null) => {
    if (!token) return null;
    if (token === "background") return vars.background ?? null;
    if (token === "muted" || token === "card") return vars.card ?? vars.muted ?? null;
    if (token === "primary") return vars.primary ?? null;
    if (token === "accent") return vars.accent ?? null;
    if (token === "chart-3") return theme.resolved.chart[2] ?? null;
    return null;
  };

  const named = (value: string | null) => {
    if (!value) return null;
    const color = parseColor(value);
    return color ? describeColor(color) : null;
  };
  const surfaceColor = tokenColor(surfaceToken);
  const palette = [...new Set([
    vars.background,
    vars.card ?? vars.muted,
    vars.primary,
    vars.accent,
    ...theme.resolved.chart,
  ].flatMap((value) => named(value ?? null) ?? []))];

  return {
    palette: palette.join(", "),
    surfaceColor: named(surfaceColor),
  };
}

type AssetSlotSummary = {
  aspect: AssetInput["aspect_ratio"];
  paths: string[];
};

type AssetOutcome = {
  asset: AssetInput;
  result: GeneratedAssetResult;
  slotPaths: string[];
};

type SuccessfulAssetOutcome = AssetOutcome & {
  result: Extract<GeneratedAssetResult, { status: "success" }>;
};

function isSuccessfulOutcome(
  outcome: AssetOutcome,
): outcome is SuccessfulAssetOutcome {
  return outcome.result.status === "success";
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
  slots,
  asset,
}: {
  projectId: string;
  signal: AbortSignal;
  logger: ToolParams["logger"];
  session: ToolParams["session"];
  slots: Map<string, AssetSlotSummary>;
  asset: AssetInput;
}): Promise<AssetOutcome> {
  const slot = slots.get(asset.name);
  const input = slot ? { ...asset, aspect_ratio: slot.aspect } : asset;
  const slotPaths = slot?.paths ?? [];

  try {
    const context = themeContext(session, input.placement_surface);
    const cacheKey = assetCacheKey(input, context);
    const cached = await findGeneratedProjectAsset({ projectId, cacheKey });
    const generated = cached ?? await (async () => {
      const result = await withGenerationSlot(() =>
        generateRaster({ input, context, signal, logger }),
      );
      return storeGeneratedProjectAsset({
        projectId,
        cacheKey,
        suggestedName: input.name,
        mediaType: result.mediaType,
        bytes: result.bytes,
      });
    })();

    await logger.write("generate_asset.completed", {
      assetId: generated.assetId,
      name: input.name,
      mediaType: generated.mediaType,
      localPath: generated.localPath,
      cached: Boolean(cached),
    });

    return {
      asset: input,
      slotPaths,
      result: {
        status: "success",
        name: input.name,
        url: generated.previewUrl,
        localPath: generated.localPath,
      },
    };
  } catch (error) {
    await logger.write("generate_asset.failed", { name: input.name, error });
    return {
      asset: input,
      slotPaths,
      result: assetFailure(
        input.name,
        "ASSET_GENERATION_FAILED",
        error,
        `Do not retry "${input.name}" with the same request. Build this visual in code with the semantic tokens and standard Tailwind utilities instead, or change the subject.`,
      ),
    };
  }
}

/** Replaces asset: placeholders for the whole batch in one source change. */
async function placeAssetSlots({
  projectId,
  signal,
  logger,
  session,
  successes,
}: {
  projectId: string;
  signal: AbortSignal;
  logger: ToolParams["logger"];
  session: ToolParams["session"];
  successes: SuccessfulAssetOutcome[];
}) {
  if (!successes.some((outcome) => outcome.slotPaths.length > 0)) return;

  try {
    const snapshot = await captureProjectSourceSnapshot(projectId, signal);
    const contents = new Map(snapshot.map((file) => [file.path, file.content]));
    const seen = new Set<string>();
    const changes: Array<{ type: "create"; path: string; content: string }> = [];
    const placedNames = new Map<string, Set<string>>();

    for (const outcome of successes) {
      for (const path of outcome.slotPaths) {
        const content = contents.get(path);
        if (content === undefined) continue;

        if (!seen.has(path)) {
          seen.add(path);
          const next = session.resolveAssetSlots(content);
          if (next !== content) {
            changes.push({ type: "create", path, content: next });
          }
        }

        if (!new RegExp(`asset:${outcome.result.name}(?![a-z0-9-])`).test(content)) {
          continue;
        }
        const names = placedNames.get(path) ?? new Set<string>();
        names.add(outcome.result.name);
        placedNames.set(path, names);
      }
    }
    if (changes.length === 0) return;

    const { contents: applied } = await applyProjectChanges(projectId, changes, {
      signal,
    });
    session.recordEdit();
    for (const content of applied) {
      session.trackAssetSlots(content.path, content.after);
      const names = placedNames.get(content.path);
      if (!names) continue;
      for (const outcome of successes) {
        if (!names.has(outcome.result.name)) continue;
        outcome.result.placedIn = [
          ...(outcome.result.placedIn ?? []),
          content.path,
        ];
      }
    }
  } catch (error) {
    await logger.write("generate_asset.placement_failed", { error });
  }
}

export const generateAsset = ({
  projectId,
  signal,
  logger,
  session,
}: Pick<ToolParams, "projectId" | "signal" | "logger" | "session">) =>
  tool({
    description:
      "Generate images (objects, materials, abstract forms, illustrations, or photographs). On designed sites, write src=\"asset:<name>\" where each image belongs, then call this with those exact names; Bloom swaps in the files. If no placeholder exists yet, the asset is still generated and you can use its localPath. Every asset needs a prompt. Write a literal prompt: subject, style, imagery direction, composition, crop, camera, lighting, materials, and where the asset appears. The preset palette is applied automatically. Set placement_surface to the token the image sits on. Build product screens, cards, charts, badges, and interface text in code. Returns each asset's name, localPath, and placedIn; a failed asset does not stop the rest.",
    inputSchema: generateAssetInputSchema,
    outputSchema: generateAssetOutputSchema,
    execute: async (input) => {
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
        const slots = new Map<string, AssetSlotSummary>(
          session.pendingAssetSlots().map((slot) => [
            slot.name,
            { aspect: slot.aspect, paths: slot.paths },
          ]),
        );
        let outcomes = await Promise.all(
          input.assets.map((asset) =>
            generateOneAsset({
              projectId,
              signal,
              logger,
              session,
              slots,
              asset,
            }),
          ),
        );
        let successes = outcomes.filter(isSuccessfulOutcome);

        if (successes.length > 0) {
          try {
            await materializeGeneratedProjectAssets(projectId, signal);
            for (const outcome of successes) {
              session.recordGeneratedAsset({
                name: outcome.result.name,
                localPath: outcome.result.localPath,
              });
            }
          } catch (error) {
            await logger.write("generate_asset.materialize_failed", { error });
            outcomes = outcomes.map((outcome) =>
              outcome.result.status === "success"
                ? {
                  ...outcome,
                  result: assetFailure(
                    outcome.asset.name,
                    "ASSET_MATERIALIZATION_FAILED",
                    error,
                    "The image was generated but could not be installed in the project runtime. Retry this batch; a cached image may be reused.",
                  ),
                }
                : outcome,
            );
            successes = [];
          }
        }

        if (successes.length > 0) {
          await placeAssetSlots({
            projectId,
            signal,
            logger,
            session,
            successes,
          });
        }

        return { assets: outcomes.map((outcome) => outcome.result) };
      } catch (error) {
        await logger.write("generate_asset.batch_failed", { error });
        return {
          error: toolError(
            "ASSET_GENERATION_FAILED",
            error,
            "Do not retry the same batch. Inspect the failure and build any missing visuals in code.",
          ),
        };
      }
    },
    toModelOutput: async ({ output }) => {
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
            text: JSON.stringify({
              assets: summaries,
              ...(output.assets.some((asset) => asset.status === "success")
                ? {
                  placement:
                    "Files listed in an asset's placedIn already use its image; do not edit them for that asset. For every success without placedIn, use its localPath as an image src or CSS url(...). Never use url or assetId in site code.",
                }
                : {}),
            }),
          },
          ...imageParts.filter((part) => part !== null),
        ],
      };
    },
  });
