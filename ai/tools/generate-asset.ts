import { createHash } from "node:crypto";

import { generateImage, generateText, Output, tool, type UserContent } from "ai";
import z from "zod/v4";

import { getImageModelOptions, getUtilityModelOptions } from "@/ai/config";
import type { ToolParams } from "@/ai/tools";
import { toolFailure, toolOutputSchema } from "@/ai/tools/schemas";
import {
  findGeneratedProjectAsset,
  readProjectImageAsset,
  resolveGeneratedImageForModel,
  storeGeneratedProjectAsset,
  type ProjectGeneratedImageMediaType,
} from "@/lib/generated-assets.server";
import { auditGeneratedImage } from "@/ai/design-vision";
import { describeColor, parseColor } from "@/lib/design/color";
import { modelAssetFilename } from "@/lib/model-asset-reference";
import {
  applyProjectChanges,
  captureProjectSourceSnapshot,
  materializeGeneratedProjectAssets,
} from "@/lib/runtime/runtime-service.server";
import { placeholderFor } from "@/lib/design/asset-slots";

const MAX_SVG_BYTES = 900_000;
const MAX_CONCURRENT_GENERATIONS = 2;

let activeGenerations = 0;
const generationQueue: Array<() => void> = [];

/** Image providers rate-limit bursts; parallel tool calls share two slots. */
async function withGenerationSlot<T>(run: () => Promise<T>) {
  if (activeGenerations >= MAX_CONCURRENT_GENERATIONS) {
    await new Promise<void>((resolve) => generationQueue.push(resolve));
  }
  activeGenerations += 1;
  try {
    return await run();
  } finally {
    activeGenerations -= 1;
    generationQueue.shift()?.();
  }
}

const influenceSchema = z.enum([
  "content",
  "composition",
  "style",
  "palette",
]);

const referenceSchema = z.strictObject({
  assetId: z.string().trim().min(8).max(64).describe(
    "Bloom asset ID (UUID) for a user-uploaded image or an earlier generateAsset result.",
  ),
  influence: influenceSchema.describe(
    "The part of this reference the generated result should follow.",
  ),
});

const commonInputShape = {
  kind: z.enum(["raster", "svg"]).describe(
    "Raster creates a PNG/JPEG/WebP image. SVG creates editable vector markup.",
  ),
  name: z.string().trim().min(1).max(100).describe(
    "Short semantic filename stem for the generated asset, such as hero-orbit or pricing-texture.",
  ),
  role: z.string().trim().min(1).max(160).describe(
    "The asset's exact visible role in the intended implementation.",
  ),
  aspect_ratio: z.enum([
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
  ]).default("1:1").describe(
    "Required output aspect ratio. The raster model chooses the actual pixel dimensions.",
  ),
  transparent: z.boolean().default(false).describe(
    "Request a transparent background when the asset should be layered over the page. Prefer placement_surface for objects sitting on a solid section or card color.",
  ),
  placement_surface: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .default(null)
    .describe(
      "Design token the image will sit on: surface-1 ... surface-8, background, muted, primary, or accent. The image is generated on a plain background of that color so it blends into the section or card.",
    ),
};

const generateAssetInputSchema = z.strictObject({
  mode: z.enum(["create", "reconstruct", "transform"]).describe(
    "Create is prompt-led, reconstruct closely follows references, and transform changes referenced content according to the prompt.",
  ),
  ...commonInputShape,
  prompt: z.string().trim().max(4_000).default("").describe(
    "Required for create and transform. Optional reconstruction constraints; leave empty for reference-only reconstruction.",
  ),
  references: z.array(referenceSchema).max(4).default([]).describe(
    "Required for reconstruct and transform. For create, include only references that should control content, composition, style, or palette.",
  ),
});

const generatedAssetSchema = z.strictObject({
  status: z.literal("success"),
  assetId: z.uuid(),
  mode: z.enum(["create", "reconstruct", "transform"]),
  kind: z.enum(["raster", "svg"]),
  role: z.string().trim().min(1).max(160),
  filename: z.string().min(1).max(160),
  mediaType: z.string().startsWith("image/"),
  localPath: z.string().startsWith("/bloom-generated-assets/"),
  projectPath: z.string().startsWith("public/bloom-generated-assets/"),
  referenceCount: z.number().int().min(0).max(4),
  cached: z.boolean(),
  placedIn: z.array(z.string()).optional(),
  preview: z.strictObject({
    url: z.string().startsWith("/api/assets/"),
    mediaType: z.string().startsWith("image/"),
  }),
});

const outputSchema = toolOutputSchema(generatedAssetSchema);

type GenerateAssetInput = z.infer<typeof generateAssetInputSchema>;
type AssetReference = z.infer<typeof referenceSchema>;

type ResolvedReference = {
  identity: string;
  influence: z.infer<typeof influenceSchema>;
  filename: string;
  mediaType: ProjectGeneratedImageMediaType;
  bytes: Uint8Array;
  screenshot?: boolean;
};

function validateGenerateAssetInput(input: GenerateAssetInput) {
  if (
    (input.mode === "create" || input.mode === "transform") &&
    input.prompt.length === 0
  ) {
    throw new Error(`${input.mode} mode requires a prompt`);
  }
  if (
    (input.mode === "reconstruct" || input.mode === "transform") &&
    input.references.length === 0
  ) {
    throw new Error(`${input.mode} mode requires at least one reference`);
  }
}

function normalizeImageMediaType(
  value: string | null,
  bytes: Uint8Array,
): ProjectGeneratedImageMediaType {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType === "image/jpg") return "image/jpeg" as const;
  if (
    mediaType === "image/jpeg" ||
    mediaType === "image/png" ||
    mediaType === "image/webp" ||
    mediaType === "image/gif" ||
    mediaType === "image/avif" ||
    mediaType === "image/svg+xml"
  ) {
    return mediaType;
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg" as const;
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png" as const;
  }
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp" as const;
  }
  const prefix = new TextDecoder().decode(bytes.slice(0, 512));
  if (/^(?:\uFEFF|\s)*(?:<\?xml[\s\S]*?\?>\s*)?<svg\b/i.test(prefix)) {
    return "image/svg+xml" as const;
  }
  throw new Error("Reference must be a supported image or SVG");
}

async function resolveReference(
  projectId: string,
  reference: AssetReference,
): Promise<ResolvedReference> {
  const resolved = await readProjectImageAsset({
    projectId,
    assetId: reference.assetId,
  });
  const digest = createHash("sha256").update(resolved.bytes).digest("hex");

  return {
    identity: `asset:${reference.assetId}:${digest}`,
    influence: reference.influence,
    filename: resolved.filename,
    mediaType: normalizeImageMediaType(resolved.mediaType, resolved.bytes),
    bytes: resolved.bytes,
  };
}

type BrandContext = {
  brand: string;
  palette: string;
  imagery: string;
  surfaceColor: string | null;
};

function generationPrompt(
  input: GenerateAssetInput,
  references: ResolvedReference[],
  context: BrandContext | null = null,
) {
  const modeInstruction = input.mode === "reconstruct"
    ? "Reconstruct the primary reference as closely as possible using newly generated pixels or vector paths. Preserve its subject, silhouette, composition, proportions, crop, palette, lighting, and visual density unless the optional prompt explicitly changes one of them."
    : input.mode === "transform"
      ? "Transform the referenced visual according to the prompt while retaining the specifically named reference influences."
      : references.length > 0
        ? "Create an original asset from the prompt while using only the specifically named qualities of the references."
        : "Create an original asset from the prompt.";
  const referenceInstructions = references.map((reference, index) =>
    reference.screenshot
      ? `Reference ${index + 1} is a screenshot of a reference website. Follow only its ${reference.influence}; never copy its subjects, characters, mascots, logos, product names, UI text, or layout chrome.`
      : `Reference ${index + 1} (${reference.filename}) controls ${reference.influence}.`,
  ).join("\n");
  const contextInstructions = context
    ? [
      `Color palette: ${context.palette}. Stay within these colors.`,
      `Art direction: ${context.imagery}.`,
      "Render clean, physically plausible lighting and materials. Do not add glows, neon, holographic sheen, lens flares, particle sparkles, or floating light streaks even if the request mentions them.",
      context.surfaceColor
        ? `Background: a perfectly flat, uniform, plain ${context.surfaceColor} filling the entire canvas edge to edge, with no vignette, gradient, texture, floor, or cast background shadow.`
        : null,
    ].filter(Boolean).join("\n")
    : "";

  return [
    "Generate exactly one production-ready visual asset for a website implementation.",
    TEXT_FREE_RULE,
    modeInstruction,
    `Visible role: ${input.role}.`,
    `Aspect ratio: ${input.aspect_ratio}.`,
    context?.surfaceColor
      ? ""
      : input.transparent
        ? "Use a genuinely transparent background and keep the subject cleanly isolated for layering."
        : "Use only the background treatment explicitly described in the request. If none is described, do not invent scenery or decorative effects; use a simple solid background appropriate to the asset's role.",
    referenceInstructions,
    contextInstructions,
    input.prompt ? `Request: ${input.prompt}` : "",
    input.mode === "create" && input.kind === "raster" && !input.transparent
      ? "Compose it like a hero shot: the main subject is large and dominant, filling most of the frame and cropped close, never a small object floating in empty space."
      : "",
    "Do not add a presentation frame, browser mockup, caption, watermark, gradient, glow, shadow, texture, or unrelated decoration unless it is explicitly described in the request or present in a supplied image reference.",
    TEXT_FREE_RULE,
  ].filter(Boolean).join("\n");
}

const TEXT_FREE_RULE =
  "The image contains no text of any kind: no words, letters, numbers, labels, captions, logos, wordmarks, signage, or user interface. Anything that would normally carry text (screens, cards, packaging, signs) is blank, abstract, or out of frame.";

const UI_SUBJECT = /\b(?:ui|user interface|interface|mock-?ups?|screenshots?|app screens?|screens? (?:showing|displaying|with)|on-screen|dashboards?|wireframes?|app (?:view|page|card|preview)|balances?|charts?|graphs?|buttons?|badges?|headlines?|captions?|labels?|typography|text|logos?|wordmarks?|app store|google play|forms?|menus?|notifications?|cards? (?:showing|displaying)|showing (?:a |the )?(?:balance|price|number|amount))\b/i;

/** Rejects requests for UI or text-bearing subjects, which image models render as garbled pseudo-UI. */
function uiSubjectProblem(input: GenerateAssetInput) {
  if (input.mode !== "create") return null;
  const request = `${input.role}. ${input.prompt}`
    .replace(/\b(?:no|without|free of|zero|avoid(?:ing)?|never)\b[^.;,]*/gi, " ")
    .replace(/\b[\w-]+-free\b|\b(?:textless|wordless|label-?less|logo-?less|unbranded|blank)\b/gi, " ");
  const match = UI_SUBJECT.exec(request);
  return match
    ? `"${match[0]}" asks for interface or text, which image models render as garbled pseudo-text. Build product screens, devices, cards, charts, badges, and logos in code with the mockup primitives from @/components/blocks (PhoneFrame, BrowserFrame, MetricCard, AreaChart, ListRow, ...). Use generateAsset only for text-free subjects: objects, materials, abstract forms, illustrations, or photography.`
    : null;
}

function assetCacheKey(
  input: GenerateAssetInput,
  references: ResolvedReference[],
  context: BrandContext | null,
) {
  return createHash("sha256")
    .update(JSON.stringify({
      ...input,
      context,
      references: references.map(({ identity, influence }) => ({
        identity,
        influence,
      })),
    }))
    .digest("hex")
    .slice(0, 24);
}

function dataUrl(reference: ResolvedReference) {
  return `data:${reference.mediaType};base64,${Buffer.from(reference.bytes).toString("base64")}`;
}

function assertSafeSvg(svg: string) {
  const normalized = svg.trim();
  if (
    Buffer.byteLength(normalized, "utf8") > MAX_SVG_BYTES ||
    !/^<svg\b/i.test(normalized) ||
    !/<\/svg>$/i.test(normalized) ||
    !/\bviewBox\s*=\s*["'][^"']+["']/i.test(normalized)
  ) {
    throw new Error("Generated SVG is incomplete or has no valid viewBox");
  }
  if (
    /<!DOCTYPE|<!ENTITY|<\/?(?:script|foreignObject|iframe|object|embed|audio|video)\b/i.test(normalized) ||
    /\son[a-z]+\s*=/i.test(normalized) ||
    /(?:href|xlink:href)\s*=\s*["'](?!#)[^"']*["']/i.test(normalized) ||
    /url\(\s*["']?(?!#)/i.test(normalized) ||
    /@import/i.test(normalized)
  ) {
    throw new Error("Generated SVG contains unsafe external or executable content");
  }
  return normalized;
}

async function generateSvg({
  input,
  references,
  context,
  signal,
  logger,
}: {
  input: GenerateAssetInput;
  references: ResolvedReference[];
  context: BrandContext | null;
  signal: AbortSignal;
  logger: ToolParams["logger"];
}) {
  const content: UserContent = [
    {
      type: "text",
      text: `${generationPrompt(input, references, context)}\n\nReturn a standalone SVG with a responsive viewBox. Use real vector paths. Use gradients, masks, or filters only when explicitly requested or present in a supplied image reference. Do not embed raster images, scripts, external URLs, foreignObject, animation, or imported styles.`,
    },
  ];
  references.forEach((reference, index) => {
    if (reference.mediaType === "image/svg+xml") {
      content.push({
        type: "text",
        text: `Reference ${index + 1} SVG markup:\n${new TextDecoder().decode(reference.bytes)}`,
      });
      return;
    }
    content.push({
      type: "file",
      data: { type: "data", data: reference.bytes },
      mediaType: reference.mediaType,
      filename: reference.filename,
    });
  });
  const result = await generateText({
    ...getUtilityModelOptions(logger),
    abortSignal: signal,
    output: Output.object({
      name: "generated_svg_asset",
      description: "One complete, safe, standalone SVG asset.",
      schema: z.strictObject({
        svg: z.string().min(40).max(MAX_SVG_BYTES),
      }),
    }),
    messages: [{ role: "user", content }],
  });

  return {
    bytes: new TextEncoder().encode(assertSafeSvg(result.output.svg)),
    mediaType: "image/svg+xml" as const,
  };
}

async function generateRaster({
  input,
  references,
  context,
  signal,
  logger,
}: {
  input: GenerateAssetInput;
  references: ResolvedReference[];
  context: BrandContext | null;
  signal: AbortSignal;
  logger: ToolParams["logger"];
}) {
  const prompt = generationPrompt(input, references, context);
  const result = await generateImage({
    ...getImageModelOptions(undefined, logger),
    prompt: references.length > 0
      ? { text: prompt, images: references.map(dataUrl) }
      : prompt,
    n: 1,
    aspectRatio: input.aspect_ratio,
    abortSignal: signal,
  });
  const mediaType = normalizeImageMediaType(
    result.image.mediaType,
    result.image.uint8Array,
  );
  if (mediaType === "image/svg+xml") {
    throw new Error("Raster image generation returned an SVG unexpectedly");
  }

  return {
    bytes: result.image.uint8Array,
    mediaType,
  };
}

function displayFilename(
  name: string,
  mediaType: ProjectGeneratedImageMediaType,
) {
  const extension = mediaType === "image/svg+xml"
    ? "svg"
    : mediaType === "image/jpeg"
      ? "jpg"
      : mediaType.split("/")[1];
  return `${name.replace(/\.[a-z0-9]+$/i, "")}.${extension}`;
}

function brandContext(
  session: ToolParams["session"],
  surfaceToken: string | null,
): BrandContext | null {
  const brief = session.brief;
  if (!brief) return null;
  const surfaces = brief.colors.surfaces;
  const tokenColor = (token: string | null) => {
    if (!token) return null;
    const surface = /^surface-(\d)$/.exec(token);
    if (surface) return surfaces[Number(surface[1]) - 1]?.background ?? null;
    if (token === "background") return brief.colors.background;
    if (token === "muted" || token === "card") return brief.colors.muted;
    if (token === "primary") return brief.colors.primary;
    if (token === "accent") return brief.colors.accent;
    return null;
  };
  const named = (hex: string) => describeColor(parseColor(hex) ?? { r: 0, g: 0, b: 0 });
  const surfaceColor = tokenColor(surfaceToken);
  return {
    brand: brief.brand.name,
    palette: [...new Set([
      ...surfaces.map((surface) => named(surface.background)),
      named(brief.colors.primary),
      named(brief.colors.accent),
    ])].join(", "),
    imagery: brief.imagery,
    surfaceColor: surfaceColor ? named(surfaceColor) : null,
  };
}

export const generateAsset = ({
  projectId,
  mode: agentMode,
  signal,
  logger,
  session,
}: Pick<ToolParams, "projectId" | "mode" | "signal" | "logger" | "session">) =>
  tool({
    description:
      "Generate one text-free image or SVG (object, material, abstract form, illustration, or photograph) after the design brief exists. On designed sites, order matters: first write src=\"asset:<name>\" where the image belongs in a section, then call this with that exact name; a name with no written placeholder is rejected. Never request UI, screens, devices, charts, cards with data, logos, or anything with words; build those in code. Write a literal prompt: subject, composition, crop, camera, lighting, materials. The palette and imagery direction from the brief are applied automatically. Set placement_surface to the token the image sits on. Reconstruct and transform are for user-uploaded or earlier generated assets. Returns a preview and a browser-ready localPath. On designed sites Bloom swaps the asset: placeholder for it automatically; otherwise use localPath as an image src or CSS url(...).",
    inputSchema: generateAssetInputSchema,
    outputSchema,
    execute: async (input) => {
      try {
        if (agentMode !== "BUILD") {
          throw new Error("Asset generation is available only in BUILD mode");
        }

        if (session.gated && !session.brief) {
          throw new Error("Submit the design brief before generating media so assets follow its brand, palette, and imagery direction.");
        }
        validateGenerateAssetInput(input);
        const slot = session.gated
          ? session.pendingAssetSlots().find((candidate) => candidate.name === input.name.trim().toLowerCase())
          : undefined;
        if (session.gated && session.brief && !slot && session.pendingSections().length > 0) {
          const waiting = session.pendingAssetSlots().map((candidate) => `"${candidate.name}"`);
          return toolFailure(
            "ASSET_TOO_EARLY",
            new Error(`No image placeholder is named "${input.name}". Images are generated for placeholders already written in a section.`),
            waiting.length > 0
              ? `Placeholders waiting now: ${waiting.join(", ")}. Call generateAsset with name set to one of these exactly.`
              : `Write src="${placeholderFor("<name>")}" (or image="${placeholderFor("<name>")}" on a block) where the image belongs in a section you are building, then call generateAsset with that exact name.`,
          );
        }
        if (slot) input = { ...input, aspect_ratio: slot.aspect };
        const uiProblem = session.gated ? uiSubjectProblem(input) : null;
        if (uiProblem) {
          await logger.write("generate_asset.rejected", { role: input.role, reason: uiProblem });
          return toolFailure("ASSET_REQUEST_REJECTED", new Error(uiProblem), "Build this visual in code, or request a text-free subject instead.");
        }
        const references = await Promise.all(
          input.references.map((reference) =>
            resolveReference(projectId, reference),
          ),
        );
        const context = brandContext(session, input.placement_surface);
        const cacheKey = assetCacheKey(input, references, context);
        const cached = await findGeneratedProjectAsset({ projectId, cacheKey });
        const generated = cached ?? await (async () => {
          const generateOnce = (attemptInput: GenerateAssetInput) =>
            withGenerationSlot<{
              bytes: Uint8Array;
              mediaType: ProjectGeneratedImageMediaType;
            }>(() =>
              attemptInput.kind === "svg"
                ? generateSvg({ input: attemptInput, references, context, signal, logger })
                : generateRaster({ input: attemptInput, references, context, signal, logger }),
            );
          let result = await generateOnce(input);
          if (session.gated && input.kind === "raster") {
            for (let attempt = 0; attempt < 2; attempt += 1) {
              const audit = await auditGeneratedImage({ bytes: result.bytes, mediaType: result.mediaType, logger, signal });
              await logger.write("generate_asset.audit", { role: input.role, attempt, audit });
              if (!audit || (!audit.text && !audit.ui)) break;
              if (attempt === 1) {
                throw new Error(`The generated image still contains ${audit.text ? "text" : "interface elements"} (${audit.notes}). Build this visual in code with the mockup primitives, or choose a different subject that has no text or UI.`);
              }
              result = await generateOnce({
                ...input,
                prompt: `${input.prompt}\nThe previous attempt wrongly contained ${audit.text ? "text" : "interface elements"} (${audit.notes}). Remove all of it: show only the physical or abstract subject.`,
              });
            }
          }
          return storeGeneratedProjectAsset({
            projectId,
            cacheKey,
            suggestedName: input.name,
            mediaType: result.mediaType,
            bytes: result.bytes,
          });
        })();

        await materializeGeneratedProjectAssets(projectId, signal);
        session.generatedAssets.push({ name: input.name, localPath: generated.localPath, role: input.role });
        const placedIn: string[] = [];
        if (slot) {
          const snapshot = await captureProjectSourceSnapshot(projectId, signal);
          const changes = slot.paths.flatMap((path) => {
            const content = snapshot.find((file) => file.path === path)?.content;
            if (!content) return [];
            const next = session.resolveAssetSlots(content);
            return next === content ? [] : [{ type: "create" as const, path, content: next }];
          });
          if (changes.length > 0) {
            const { contents } = await applyProjectChanges(projectId, changes, { signal });
            for (const content of contents) {
              session.trackAssetSlots(content.path, content.after);
              placedIn.push(content.path);
            }
            session.recordEdit();
          }
        }
        await logger.write("generate_asset.completed", {
          assetId: generated.assetId,
          mode: input.mode,
          kind: input.kind,
          mediaType: generated.mediaType,
          localPath: generated.localPath,
          referenceCount: references.length,
          cached: Boolean(cached),
        });

        const filename = displayFilename(input.name, generated.mediaType);
        return {
          status: "success" as const,
          assetId: generated.assetId,
          mode: input.mode,
          kind: input.kind,
          role: input.role,
          filename,
          mediaType: generated.mediaType,
          localPath: generated.localPath,
          projectPath: generated.projectPath,
          referenceCount: references.length,
          cached: Boolean(cached),
          ...(placedIn.length > 0 ? { placedIn } : {}),
          preview: {
            url: generated.previewUrl,
            mediaType: generated.mediaType,
          },
        };
      } catch (error) {
        await logger.write("generate_asset.failed", { error });
        return toolFailure(
          "ASSET_GENERATION_FAILED",
          error,
          "Do not retry this role with the same request. Build the visual in code with the mockup primitives from @/components/blocks instead.",
        );
      }
    },
    toModelOutput: async ({ output }) => {
      if ("error" in output) {
        return { type: "text" as const, value: JSON.stringify(output) };
      }

      const modelOutput = {
        status: output.status,
        assetId: output.assetId,
        kind: output.kind,
        role: output.role,
        mediaType: output.mediaType,
        localPath: output.localPath,
        implementation: output.placedIn?.length
          ? {
            required: false,
            browserPath: output.localPath,
            instruction: `Bloom already replaced the placeholder with this image in ${output.placedIn.join(", ")}. No code change is needed.`,
          }
          : {
            required: true,
            browserPath: output.localPath,
            instruction:
              `Use the exact localPath ${JSON.stringify(output.localPath)} for the ${JSON.stringify(output.role)} in the relevant applyChanges source, as an image src or CSS url(...). The file is already installed in the project runtime. Do not use projectPath, import it, redraw it, or replace it with text, emoji, CSS artwork, or an icon component. Every successful role -> localPath mapping must appear in the implementation.`,
          },
      };
      if (output.mediaType === "image/svg+xml") {
        return { type: "text" as const, value: JSON.stringify(modelOutput) };
      }

      try {
        const resolved = await resolveGeneratedImageForModel(
          projectId,
          output.preview.url,
        );
        return {
          type: "content" as const,
          value: [
            { type: "text" as const, text: JSON.stringify(modelOutput) },
            {
              type: "file" as const,
              data: { type: "data" as const, data: resolved.data },
              mediaType: resolved.mediaType,
              filename: modelAssetFilename(output.assetId, output.filename),
            },
          ],
        };
      } catch (error) {
        return {
          type: "text" as const,
          value: JSON.stringify({
            ...modelOutput,
            previewDeliveryError:
              error instanceof Error ? error.message : String(error),
          }),
        };
      }
    },
  });
