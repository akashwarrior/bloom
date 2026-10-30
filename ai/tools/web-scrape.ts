import { tool } from "ai";
import { createHash } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import z from "zod/v4";

import type { ToolParams } from "@/ai/tools";
import {
  FULL_PAGE_SCREENSHOT_NAME,
  scrapeRenderedPage,
  type RenderManifest,
} from "@/lib/runtime/web-scrape.server";
import { toolError, toolFailure, toolOutputSchema } from "@/ai/tools/schemas";
import {
  resolveGeneratedImageForModel,
  storeGeneratedImageAsset,
} from "@/lib/generated-assets.server";
import { modelAssetFilename } from "@/lib/model-asset-reference";
import { evenlySelectItems } from "@/lib/evenly-select-items";
import { compactDiagnosticMessage } from "@/lib/runtime/browser-diagnostics";
import { applyProjectChanges } from "@/lib/runtime/runtime-service.server";
import { buildNoVisualEvidenceWarning } from "@/lib/web-scrape-warnings";
import { buildPageDna, compareDna, compareWithPrimaryReference, formatDna, heroImagery } from "@/lib/design/dna";
import { brandFromHost, type ReferenceCapture, type ReferenceFrame } from "@/ai/build-session";
import { describeReferenceFrames } from "@/ai/design-vision";
import { isGalleryUrl } from "@/lib/design/study";

const WEB_SCRAPE_MANIFEST_SEGMENT_SIZE = 120;

const INITIAL_MODEL_SCREENSHOTS = 10;
const PUBLIC_REF_SCREENSHOTS = 5;
const PREVIEW_SCREENSHOTS = 6;
const MAX_COMPARISON_REFERENCE_FRAMES = 8;

const legacyScreenshotSchema = z.strictObject({
  name: z.string(),
  mimeType: z.literal("image/webp"),
  url: z.string().startsWith("/api/assets/"),
  filename: z.string(),
  size: z.number().int().positive(),
  scrollY: z.number().int().nonnegative(),
  scrollPercentage: z.number().int().min(0).max(100),
});

const uiScreenshotSchema = z.strictObject({
  name: legacyScreenshotSchema.shape.name,
  url: legacyScreenshotSchema.shape.url,
  scrollY: legacyScreenshotSchema.shape.scrollY,
  scrollPercentage: legacyScreenshotSchema.shape.scrollPercentage,
  frame: z.number().int().positive().optional(),
});

const comparisonImageSchema = z.strictObject({
  name: z.string().min(1).max(120),
  url: z.string().startsWith("/api/assets/"),
});

const viewportSchema = z.strictObject({
  width: z.number().int().min(320).max(2_560),
  height: z.number().int().min(320).max(2_000),
  deviceScaleFactor: z.number().min(1).max(3).default(1),
  isMobile: z.boolean().default(false),
  hasTouch: z.boolean().default(false),
});

const boundsSchema = z.tuple([
  z.number(),
  z.number(),
  z.number().nonnegative(),
  z.number().nonnegative(),
]);

const assetIdSchema = z.string().regex(/^a\d+$/);
const assetKindSchema = z.enum([
  "image",
  "background",
  "mask",
  "video",
  "poster",
]);
const intrinsicSizeSchema = z.tuple([
  z.number().nonnegative(),
  z.number().nonnegative(),
]);
const manifestPageSchema = z.strictObject({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
const manifestTruncationReasonSchema = z.enum([
  "nodes",
  "styles",
  "assets",
  "animations",
  "scroll_positions",
]);

const styleTableEntrySchema = z
  .record(z.string(), z.string())
  .describe(
    "Deduplicated compact style entry. Keys are abbreviated CSS property names (bg=background, bgc=background-color, bgi=background-image, bgcl=background-clip, bgs=background-size, bgp=background-position, c=color, ff=font-family, fz=font-size, fst=font-style, fw=font-weight, lh=line-height, ls=letter-spacing, ta=text-align, tt=text-transform, ws=white-space, bd=border, bdr=border-radius, bxsh=box-shadow, clp=clip-path, of=object-fit, objp=object-position, op=opacity, dsp=display, fld=flex-direction, jc=justify-content, ai=align-items, ac=align-content, gp=gap, ovf=overflow, trf=transform, w=width, h=height, gtc=grid-template-columns, gtr=grid-template-rows).",
  );

const summaryFontSchema = z.strictObject({
  family: z.string(),
  style: z.string(),
  weight: z.string(),
});

const summaryAssetSchema = z.strictObject({
  kind: assetKindSchema,
  mediaType: z.literal("image/svg+xml").optional(),
  intrinsicSize: intrinsicSizeSchema.optional(),
  // Retained only so stored pre-change scrape messages still decode.
  localPath: z.string().startsWith("/b/").optional(),
});

const capturedColorsSchema = z.array(z.string()).max(24);
const capturedTruncationReasonsSchema = z.array(
  manifestTruncationReasonSchema,
);

const browserDiagnosticSchema = z.strictObject({
  kind: z.enum(["console", "runtime", "request-failed", "http"]),
  severity: z.literal("error"),
  message: z.string().min(1).max(800),
  url: z.string().max(500).optional(),
  status: z.number().int().min(100).max(599).optional(),
});

const fidelityHeadingSchema = z.strictObject({
  nodeId: z.number().int().positive(),
  tag: z.string().max(80),
  text: z.string().max(500),
  bounds: boundsSchema,
  style: z.number().int().nonnegative().describe(
    "Index into fidelity.styleTable.",
  ),
});

const fidelitySchema = z.strictObject({
  viewportHeight: z.number().int().positive(),
  styleTable: z
    .array(styleTableEntrySchema)
    .max(64)
    .describe(
      "Deduplicated style entries shared across sections and headings. Each entry uses abbreviated CSS property keys.",
    ),
  sections: z
    .array(
      z.strictObject({
        nodeId: z.number().int().positive(),
        tag: z.string().min(1).max(80),
        bounds: boundsSchema,
        heightInViewports: z.number().nonnegative(),
        style: z.number().int().nonnegative().describe(
          "Index into fidelity.styleTable.",
        ),
        headings: z.array(fidelityHeadingSchema).max(6),
        assetIds: z.array(assetIdSchema).max(30),
        segmentIndexes: z.array(z.number().int().nonnegative()).max(12),
      }),
    )
    .max(32),
  criticalAssets: z
    .array(
      z.strictObject({
        assetId: assetIdSchema,
        kind: assetKindSchema,
        url: z.string().optional(),
        mediaType: z.literal("image/svg+xml").optional(),
        localPath: z.string().startsWith("/b/").optional(),
        alt: z.string().optional(),
        intrinsicSize: intrinsicSizeSchema.optional(),
        placements: z
          .array(
            z.strictObject({
              nodeId: z.number().int().positive(),
              bounds: boundsSchema,
            }),
          )
          .max(6),
      }),
    )
    .max(40),
  effects: z.strictObject({
    cssGradients: z.strictObject({
      nodeCount: z.number().int().nonnegative(),
      contexts: z.array(
        z.enum(["text", "control", "page", "surface"]),
      ).max(4),
      samples: z.array(
        z.strictObject({
          nodeId: z.number().int().positive(),
          tag: z.string().min(1).max(80),
          bounds: boundsSchema,
          context: z.enum(["text", "control", "page", "surface"]),
          properties: z.record(z.string(), z.string()),
        }),
      ).max(12),
      guidance: z.string().min(1).max(600),
    }),
  }),
  prioritySegments: z.array(z.number().int().nonnegative()).max(8),
  requirements: z.array(z.string().min(1).max(500)).max(12),
});

export const manifestSummarySchema = z.strictObject({
  page: manifestPageSchema,
  fidelity: fidelitySchema,
  assets: z
    .record(assetIdSchema, summaryAssetSchema)
    .describe("Non-critical observed media roles keyed by ID. Use their kind and intrinsic size only to interpret the screenshots; no source media is provided."),
  fonts: z
    .array(summaryFontSchema)
    .max(80)
    .describe("Detected font variants. Use matching referenceFonts.fonts local paths when present."),
  colors: capturedColorsSchema,
  stats: z.strictObject({
    scannedPositions: z.number().int().nonnegative(),
    omittedRepeatedNodes: z.number().int().nonnegative(),
    truncated: z.boolean(),
    truncatedBy: capturedTruncationReasonsSchema,
    totalNodes: z.number().int().nonnegative(),
    totalStyleRules: z.number().int().nonnegative(),
    segmentSize: z.literal(WEB_SCRAPE_MANIFEST_SEGMENT_SIZE),
    segmentCount: z.number().int().nonnegative(),
  }),
});

export type ManifestSummary = z.infer<typeof manifestSummarySchema>;

const importedReferenceFontSchema = z.strictObject({
  id: z.string().min(1).max(160),
  family: z.string().min(1).max(300),
  style: z.string().min(1).max(100),
  weight: z.string().min(1).max(100),
  stretch: z.string().min(1).max(100),
  format: z.string().min(1).max(100).optional(),
  unicodeRange: z.string().min(1).max(2_000).optional(),
  localPath: z.string().startsWith("/b/"),
});

const importedReferenceAssetsSchema = z.strictObject({
  routePath: z.string().min(1).max(500),
  assetPathPrefix: z
    .string()
    .startsWith("/b/")
    .describe(
      "Same-origin prefix for the captured font files listed below.",
    ),
  assetCount: z.number().int().nonnegative().describe(
    "Legacy compatibility field. New captures do not materialize scraped images or SVGs and return zero.",
  ),
  fontCount: z.number().int().nonnegative(),
  totalReferenceCount: z.number().int().nonnegative(),
  fonts: z.array(importedReferenceFontSchema).max(80),
  fontReferencesTruncated: z.boolean(),
});

const modelPageDataSchema = z.strictObject({
  targetKind: z.enum(["preview", "public"]),
  url: z.string(),
  status: z.number().int(),
  title: z.string(),
  theme: z.enum(["light", "dark"]),
  viewport: viewportSchema,
  manifest: manifestSummarySchema
    .nullable()
    .describe(
      "Compact public-page fidelity manifest. Media entries describe roles and measurements observed in the screenshots; they do not provide reusable source paths. Null for current-app previews and localhost/loopback URLs.",
    ),
  referenceAssets: importedReferenceAssetsSchema
    .nullable()
    .describe(
      "Same-origin captured font files. Font entries identify the family, style, weight, stretch, format, and Unicode range of each local path. The field name is retained for stored-message compatibility; new captures contain no scraped image or SVG proxies.",
    ),
  referenceAssetsError: z.string().min(1).max(1_000).nullable(),
  pageHeight: z.number().int().positive(),
  captureTruncated: z
    .boolean()
    .describe(
      "True when page traversal, manifest limits, or screenshot selection omitted evidence.",
    ),
  diagnostics: z.array(browserDiagnosticSchema).max(10).nullable(),
  blocked: z.boolean(),
  evidenceMode: z
    .enum(["full", "design"])
    .optional()
    .describe("full keeps the complete fidelity manifest (clones); design keeps measured design DNA and section outline."),
  designDna: z.string().max(24_000).nullable().optional(),
  frames: z
    .array(
      z.strictObject({
        number: z.number().int().positive(),
        scrollY: z.number().int().nonnegative(),
        scrollPercentage: z.number().int().min(0).max(100),
        attached: z.boolean(),
      }),
    )
    .max(20)
    .optional(),
  captureHint: z.string().max(600).optional(),
  review: z
    .strictObject({
      gaps: z.array(z.string().min(1).max(800)).max(20),
      comparedWith: z.string().max(300).nullable(),
    })
    .nullable()
    .optional(),
});

type ModelPageData = z.infer<typeof modelPageDataSchema>;

const MODEL_EVIDENCE_PREFIX = "deflate-raw-v1:";

function encodeModelEvidence(pageData: ModelPageData) {
  return `${MODEL_EVIDENCE_PREFIX}${deflateRawSync(
    Buffer.from(JSON.stringify(pageData), "utf8"),
  ).toString("base64url")}`;
}

function decodeModelEvidence(value: string): ModelPageData {
  if (!value.startsWith(MODEL_EVIDENCE_PREFIX)) {
    throw new Error("Unsupported web scrape model evidence encoding");
  }

  const parsed: unknown = JSON.parse(
    inflateRawSync(
      Buffer.from(value.slice(MODEL_EVIDENCE_PREFIX.length), "base64url"),
    ).toString("utf8"),
  );
  const validation = modelPageDataSchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error("Invalid web scrape model evidence");
  }

  // Return the decoded object rather than Zod's clone so its original key
  // insertion order remains identical to the pre-compaction model payload.
  return parsed as ModelPageData;
}

const compactOutputSchema = z.strictObject({
  screenshots: z
    .array(uiScreenshotSchema)
    .max(INITIAL_MODEL_SCREENSHOTS)
    .describe("UI-facing representative top-to-bottom screenshots."),
  comparisons: z
    .array(comparisonImageSchema)
    .max(6)
    .optional()
    .describe("Side-by-side anchor reference vs preview images."),
  modelEvidence: z
    .string()
    .startsWith(MODEL_EVIDENCE_PREFIX)
    .refine((value) => {
      try {
        decodeModelEvidence(value);
        return true;
      } catch {
        return false;
      }
    }, "Invalid web scrape model evidence"),
});

const legacyOutputSchema = modelPageDataSchema.extend({
  screenshots: z.array(legacyScreenshotSchema).max(INITIAL_MODEL_SCREENSHOTS),
});

const outputSchema = toolOutputSchema(
  z.union([compactOutputSchema, legacyOutputSchema]),
);

type WebScrapeCapture = Pick<RenderManifest, "fonts"> & {
  namespace: string;
};

/** Anchor frames (bytes) used to build side-by-side anchor/preview comparisons. */
export async function loadComparisonFrames(projectId: string, anchor: ReferenceCapture) {
  return (await Promise.all(
    evenlySelectItems(anchor.frames, MAX_COMPARISON_REFERENCE_FRAMES).map(async (frame) => {
      const resolved = await resolveGeneratedImageForModel(projectId, frame.assetUrl).catch(() => null);
      return resolved
        ? {
          bytes: resolved.data,
          mimeType: resolved.mediaType,
          scrollPercentage: frame.scrollPercentage,
          label: `ANCHOR ${anchor.host} frame ${frame.number} (${frame.scrollPercentage}%)`,
        }
        : null;
    }),
  )).filter((frame) => frame !== null);
}

export const webScrape = ({
  projectId,
  mode,
  signal,
  logger,
  session,
}: Pick<ToolParams, "projectId" | "mode" | "signal" | "logger" | "session">) => {
  const activeTargets = new Set<string>();

  return tool({
    description:
      "Capture a rendered page. By default the model receives one full-page screenshot (top to bottom) plus numbered viewport frames for measurement; set deep_scrape for scroll-animated pages. Public URLs (category leaders or a clone target) return screenshots, numbered frames, measured design DNA (theme, surface rhythm, palette, type scale, buttons, cards, layout), and a section outline; detected font files are materialized but scraped images/SVGs are never reusable. The current project preview (pass a relative path such as `/`) returns your preview frames plus measured gaps against the design brief, and side-by-side anchor/preview comparison images once a brief exists. Use viewport `mobile` on the preview to check responsive overflow.",
    inputSchema: z.strictObject({
      url: z
        .string()
        .min(1)
        .max(2_000)
        .describe(
          "Target page. For the CURRENT PROJECT preview, pass ONLY the relative pathname, e.g. `/`, `/login`, or `/dashboard?tab=settings` never include `localhost`, `127.0.0.1`, a port, or a local origin. For an EXTERNAL PUBLIC website, pass its full URL or domain, e.g. `https://example.com` or `example.com`.",
        ),
      theme: z
        .enum(["light", "dark"])
        .default("light")
        .describe("Color scheme used while rendering the page."),
      viewport: z.enum(["mobile", "tablet", "desktop"])
        .default("desktop")
        .describe(
          "viewport for this scrape.",
        ),
      include_screenshots: z
        .boolean()
        .default(false)
        .describe(
          "Include rendered screenshots. Enable for cloning, canvas/WebGL pages, and visual verification.",
        ),
      deep_scrape: z
        .boolean()
        .default(false)
        .describe(
          "Scroll the page and attach one screenshot per viewport instead of a single full-page image. Use only for scroll-animated, scroll-revealed, canvas or WebGL pages whose sections render blank or unrevealed in the full-page capture.",
        ),
      max_screenshots: z
        .number()
        .int()
        .min(1)
        .max(16)
        .default(16)
        .describe(
          "Viewport frame limit. Visual captures always keep up to ten frames for measurement; only deep_scrape attaches them as separate images.",
        ),
    }),
    outputSchema,
    execute: async ({ url, ...input }) => {
      const previewReviewRequired = url.trim().startsWith("/");

      const includeScreenshots = input.include_screenshots || previewReviewRequired || session.gated;
      const maxScreenshots = includeScreenshots
        ? Math.max(input.max_screenshots, INITIAL_MODEL_SCREENSHOTS)
        : input.max_screenshots;

      const researching = session.gated && !session.brief && session.workflow !== "app";
      if (researching && previewReviewRequired) {
        return toolFailure(
          "REFERENCE_URL_REQUIRED",
          "The project preview cannot be a design reference.",
          "Capture a public reference site with its full URL, e.g. https://phantom.com/.",
        );
      }
      if (researching && session.original && isGalleryUrl(url)) {
        return toolFailure(
          "REFERENCE_IS_A_GALLERY",
          "This is a design gallery, marketplace, article or case-study page, not the product's own site.",
          "Capture the product's own homepage (the domain named in the result title) instead.",
        );
      }
      if (activeTargets.has(url)) {
        return toolFailure(
          "WEB_SCRAPE_ALREADY_RUNNING",
          "Another capture of this URL is already running in the current step.",
          "Use the in-flight result first. If it reveals a responsive gap, request one additional viewport in a later step.",
        );
      }

      activeTargets.add(url);
      try {
        const anchor = previewReviewRequired ? session.comparisonAnchor : null;
        const comparisonFrames = anchor && input.viewport === "desktop"
          ? await loadComparisonFrames(projectId, anchor)
          : [];

        const scrape = await scrapeRenderedPage({
          projectId,
          signal,
          url,
          theme: input.theme,
          viewport: input.viewport,
          includeScreenshots,
          deep: input.deep_scrape,
          maxScreenshots,
          comparisonFrames,
        });

        const frameNotesPromise = scrape.targetKind === "public" && !scrape.blocked && scrape.screenshots.length > 0
          ? describeReferenceFrames({
            host: new URL(scrape.url).hostname.replace(/^www\./, ""),
            frames: scrape.screenshots.map((screenshot, index) => ({
              number: index + 1,
              scrollY: screenshot.scrollY,
              bytes: screenshot.bytes,
              mediaType: screenshot.mimeType,
            })),
            logger,
            signal,
          })
          : Promise.resolve(new Map<number, string>());
        const screenshotLabel = scrape.targetKind === "public"
          ? "public-reference"
          : "current-preview";
        const storedScreenshots = await Promise.all(
          scrape.screenshots.map(async (screenshot) => {
            const storedScreenshot = await storeGeneratedImageAsset({
              projectId,
              filename: `${screenshotLabel}-${screenshot.name}-${screenshot.scrollY}.webp`,
              mediaType: screenshot.mimeType,
              bytes: screenshot.bytes,
            });

            return {
              name: screenshot.name,
              url: storedScreenshot.url,
              assetId: storedScreenshot.id,
              scrollY: screenshot.scrollY,
              scrollPercentage: screenshot.scrollPercentage,
            };
          }),
        );
        const numberedScreenshots = storedScreenshots.map((screenshot, index) => ({
          ...screenshot,
          frame: index + 1,
        }));
        const dna = scrape.frameAnalyses.length > 0 || scrape.designProfile
          ? buildPageDna({
            frames: scrape.frameAnalyses,
            profile: scrape.designProfile,
            pageHeight: scrape.pageHeight,
            viewportHeight: scrape.viewport.height,
          })
          : null;

        let referenceAssets = null;
        let referenceAssetsError = null;
        if (
          mode === "BUILD" &&
          scrape.targetKind === "public" &&
          scrape.referenceFontCatalog
        ) {
          try {
            referenceAssets = await importReferenceFonts({
              projectId,
              signal,
              capture: {
                fonts: scrape.referenceFontCatalog.fonts,
                namespace: referenceFontNamespace(
                  scrape.url,
                  scrape.theme,
                  scrape.viewport,
                ),
              },
            });

            if (referenceAssets) {
              await logger.write("web_scrape.reference_fonts_imported", {
                routePath: referenceAssets.routePath,
                fontCount: referenceAssets.fontCount,
              });
            }
          } catch (error) {
            if (signal.aborted) throw error;
            referenceAssetsError = compactDiagnosticMessage(
              error instanceof Error
                ? error.message
                : "Reference fonts could not be materialized.",
              1_000,
            );
            await logger.write("web_scrape.reference_fonts_failed", { error });
          }
        }

        const fullPage = scrape.fullPage
          ? {
            name: scrape.fullPage.name,
            url: (await storeGeneratedImageAsset({
              projectId,
              filename: `${screenshotLabel}-full-page.webp`,
              mediaType: scrape.fullPage.mimeType,
              bytes: scrape.fullPage.bytes,
            })).url,
            scrollY: 0,
            scrollPercentage: 0,
          }
          : null;
        const representativeScreenshots = fullPage
          ? []
          : evenlySelectItems(
            numberedScreenshots,
            scrape.targetKind === "public"
              ? PUBLIC_REF_SCREENSHOTS
              : PREVIEW_SCREENSHOTS,
          );
        const captureTruncated =
          scrape.captureTruncated ||
          (!fullPage && representativeScreenshots.length < storedScreenshots.length);
        const attachedFrames = new Set(representativeScreenshots.map((screenshot) => screenshot.frame));
        const blankFrames = fullPage
          ? scrape.frameAnalyses.slice(1).filter((frame) => (frame.palette[0]?.share ?? 0) >= 0.995).length
          : 0;
        const captureHint = blankFrames >= 2
          ? `${blankFrames} of ${scrape.frameAnalyses.length} frames are a single flat color in the full-page capture. If the page reveals content on scroll, capture it again with deep_scrape: true.`
          : undefined;

        let designDna: string | null = null;
        let review: ModelPageData["review"] = null;
        if (scrape.targetKind === "public") {
          const usable = !scrape.blocked && numberedScreenshots.length > 0 && dna !== null;
          if (!usable) {
            session.failedScrapes += 1;
          } else {
            const host = new URL(scrape.url).hostname.replace(/^www\./, "");
            const frameNotes = await frameNotesPromise;
            designDna = [
              formatDna(dna, host),
              frameNotes.size > 0
                ? `- Frame compositions (frame number: what is on screen):\n${[...frameNotes.entries()]
                  .sort(([a], [b]) => a - b)
                  .map(([number, note]) => `  ${number}. ${note}`)
                  .join("\n")}`
                : null,
            ].filter(Boolean).join("\n");
            session.recordReference({
              url: scrape.url,
              host,
              brand: brandFromHost(host),
              title: scrape.title,
              pageHeight: scrape.pageHeight,
              viewportHeight: scrape.viewport.height,
              dna,
              dnaText: designDna,
              frames: numberedScreenshots.map((screenshot): ReferenceFrame => ({
                number: screenshot.frame,
                assetId: screenshot.assetId,
                assetUrl: screenshot.url,
                scrollY: screenshot.scrollY,
                scrollPercentage: screenshot.scrollPercentage,
              })),
              frameNotes: Object.fromEntries(frameNotes),
              heroImagery: heroImagery(scrape.frameAnalyses, scrape.manifest?.fidelity.criticalAssets ?? [], scrape.viewport, scrape.designProfile),
              largeMedia: (scrape.manifest?.fidelity.criticalAssets ?? []).filter((asset) =>
                asset.kind !== "mask" &&
                asset.placements.some(
                  (placement) => placement.bounds[2] * placement.bounds[3] >= scrape.viewport.width * scrape.viewport.height * 0.04,
                ),
              ).length,
              headings: [
                ...new Set([
                  ...scrape.title.split(/\s+[|\u2013\u2014-]\s+/),
                  ...(scrape.manifest?.fidelity.sections ?? [])
                    .flatMap((section) => section.headings.map((heading) => heading.text)),
                  ...(scrape.designProfile?.headings.map((heading) => heading.text) ?? []),
                  ...(scrape.designProfile?.prominentTexts ?? []),
                ]),
              ]
                .filter((text) => text.trim().length > 0)
                .slice(0, 160),
              fonts: referenceAssets?.fonts.map((font) => ({
                family: font.family,
                weight: font.weight,
                style: font.style,
                localPath: font.localPath,
                ...(font.format ? { format: font.format } : {}),
                ...(font.unicodeRange ? { unicodeRange: font.unicodeRange } : {}),
              })) ?? [],
            });
            await logger.write("web_scrape.reference_recorded", {
              url: scrape.url,
              frames: numberedScreenshots.length,
              heroImagery: heroImagery(scrape.frameAnalyses, scrape.manifest?.fidelity.criticalAssets ?? [], scrape.viewport, scrape.designProfile),
              theme: dna.theme,
              surfaces: dna.surfaces.length,
            });
          }
        } else if (dna) {
          const brief = session.brief;
          const gaps = brief && input.viewport === "desktop"
            ? compareDna({
              preview: dna,
              previewProfile: scrape.designProfile,
              anchor: session.comparisonAnchor?.dna ?? null,
              expected: {
                theme: brief.theme,
                surfaceColors: brief.colors.surfaces.map((surface) => surface.background),
                displaySize: brief.typography.display.sizePx,
                displayFamily: session.briefFonts?.display.kind === "google"
                  ? session.briefFonts.display.entry.family
                  : session.briefFonts?.display.family ?? null,
                bodyFamily: session.briefFonts?.body.kind === "google"
                  ? session.briefFonts.body.entry.family
                  : session.briefFonts?.body.family ?? null,
              },
            }).map((gap) => `[${gap.severity}] ${gap.message}`)
            : [];
          const primary = session.original ? session.anchor : null;
          const referenceGaps = brief && primary && input.viewport === "desktop"
            ? compareWithPrimaryReference({
              preview: dna,
              previewHeroImagery: heroImagery(scrape.frameAnalyses, scrape.manifest?.fidelity.criticalAssets ?? [], scrape.viewport, scrape.designProfile),
              reference: primary,
              requestedTheme: session.requestedTheme,
            }).filter((gap) => gap.severity !== "minor").map((gap) => `[${gap.severity}] ${gap.message}`)
            : [];
          gaps.unshift(...referenceGaps);
          if (input.viewport === "mobile" && (scrape.designProfile?.overflowX ?? 0) > 4) {
            gaps.unshift(`[blocking] The mobile layout overflows horizontally by ${scrape.designProfile!.overflowX}px. Find the element wider than the viewport (fixed widths, nowrap display text, wide grids) and make it responsive.`);
          }
          designDna = formatDna(dna, "YOUR PREVIEW");
          review = {
            gaps,
            comparedWith: anchor ? anchor.url : null,
          };
          if (input.viewport === "desktop") {
            session.reviews.push({
              step: session.stepNumber,
              dna,
              profile: scrape.designProfile,
              gaps,
            });
          }
        }

        const comparisons = await Promise.all(
          scrape.comparisons.map(async (comparison, index) => {
            const stored = await storeGeneratedImageAsset({
              projectId,
              filename: `current-preview-comparison-${index + 1}.webp`,
              mediaType: "image/webp",
              bytes: comparison.bytes,
            });
            return { name: `Comparison ${index + 1}`, url: stored.url };
          }),
        ).catch(() => []);

        const pageData = {
          targetKind: scrape.targetKind,
          url: scrape.url,
          status: scrape.status,
          title: scrape.title,
          theme: scrape.theme,
          viewport: scrape.viewport,
          manifest: scrape.manifest,
          referenceAssets,
          referenceAssetsError,
          pageHeight: scrape.pageHeight,
          captureTruncated,
          diagnostics: scrape.diagnostics,
          blocked: scrape.blocked,
          evidenceMode: session.workflow === "clone" ? "full" : "design",
          designDna,
          frames: numberedScreenshots.map((screenshot) => ({
            number: screenshot.frame,
            scrollY: screenshot.scrollY,
            scrollPercentage: screenshot.scrollPercentage,
            attached: attachedFrames.has(screenshot.frame),
          })),
          ...(captureHint ? { captureHint } : {}),
          review,
        } satisfies ModelPageData;

        return {
          screenshots: fullPage ? [fullPage] : representativeScreenshots.map((screenshot) => ({
            name: screenshot.name,
            url: screenshot.url,
            scrollY: screenshot.scrollY,
            scrollPercentage: screenshot.scrollPercentage,
            frame: screenshot.frame,
          })),
          ...(comparisons.length > 0 ? { comparisons } : {}),
          modelEvidence: encodeModelEvidence(pageData),
        } satisfies z.infer<typeof compactOutputSchema>;
      } catch (error) {
        return toolFailure(
          "WEB_SCRAPE_FAILED",
          error,
          "Check that the URL is valid and reachable. A public website may block Chromium or the server IP.",
        );
      } finally {
        activeTargets.delete(url);
      }
    },
    toModelOutput: async ({ output }) => {
      if ("error" in output) {
        return { type: "text" as const, value: JSON.stringify(output) };
      }

      const { screenshots } = output;
      const comparisons = "comparisons" in output ? output.comparisons ?? [] : [];
      const pageData = "modelEvidence" in output
        ? decodeModelEvidence(output.modelEvidence)
        : (() => {
          const legacyPageData: ModelPageData & {
            screenshots?: typeof screenshots;
          } = { ...output };
          delete legacyPageData.screenshots;
          return legacyPageData;
        })();

      const {
        referenceAssets,
        referenceAssetsError,
        evidenceMode,
        designDna,
        frames,
        captureHint,
        review,
        ...pageEvidence
      } = pageData;
      const designMode = pageData.targetKind === "public" && evidenceMode === "design";
      const evidence = designMode
        ? {
          targetKind: pageEvidence.targetKind,
          url: pageEvidence.url,
          status: pageEvidence.status,
          title: pageEvidence.title,
          pageHeight: pageEvidence.pageHeight,
          blocked: pageEvidence.blocked,
          sections: pageEvidence.manifest?.fidelity.sections.map((section) => ({
            tag: section.tag,
            top: Math.round(section.bounds[1]),
            height: Math.round(section.bounds[3]),
            referenceHeadlines: section.headings.map((heading) => heading.text),
          })) ?? [],
          media: pageEvidence.manifest
            ? Object.entries(
              pageEvidence.manifest.fidelity.criticalAssets.reduce<Record<string, number>>(
                (counts, asset) => ({ ...counts, [asset.kind]: (counts[asset.kind] ?? 0) + 1 }),
                {},
              ),
            ).map(([kind, count]) => `${count} ${kind}`).join(", ")
            : null,
          copyNotice:
            "referenceHeadlines, claims, ratings, and numbers belong to this reference. Never reuse them; write original copy for the new brand.",
        }
        : pageEvidence;
      const modelPageDataWithDirection = referenceAssets && !designMode
        ? {
          ...evidence,
          referenceFonts: {
            fontCount: referenceAssets.fontCount,
            fonts: referenceAssets.fonts,
            fontReferencesTruncated: referenceAssets.fontReferencesTruncated,
            instruction:
              "Each entry is one captured font file. Declare its localPath with the supplied family, style, weight, stretch, format, and unicodeRange instead of guessing which variant or subset the file contains.",
          },
        }
        : referenceAssetsError && !designMode
          ? {
            ...evidence,
            referenceFonts: {
              instruction:
                "Captured font files could not be materialized for this capture. Use a suitable project or next/font alternative.",
              error: referenceAssetsError,
            },
          }
          : evidence;
      const frameIndex = frames && frames.length > 0
        ? `Captured frames (use these numbers in the brief): ${frames
          .map((frame) => `${frame.number}@${frame.scrollPercentage}%${frame.attached ? "*" : ""}`)
          .join(", ")} ${frames.some((frame) => frame.attached)
            ? "(* = attached below)."
            : "(one full-page image is attached below)."}`
        : null;
      const reviewText = review
        ? review.gaps.length > 0
          ? `MEASURED GAPS vs the design brief${review.comparedWith ? ` and anchor ${review.comparedWith}` : ""} (fix blocking and major gaps, largest first):\n${review.gaps.map((gap) => `- ${gap}`).join("\n")}`
          : "No measured gaps against the design brief. Still compare the images for composition, spacing, imagery, and copy quality."
        : null;
      const header = [designDna, frameIndex, captureHint, reviewText].filter(Boolean).join("\n\n");

      if (screenshots.length === 0) {
        if (pageData.targetKind === "public") {
          await logger.write("web_scrape.no_visual_evidence", {
            url: pageData.url,
          });
        }
        return {
          type: "text" as const,
          value: [
            header,
            JSON.stringify({
              ...modelPageDataWithDirection,
              ...(pageData.targetKind === "public"
                ? { visualWarning: buildNoVisualEvidenceWarning(pageData.url) }
                : {}),
            }),
          ].filter(Boolean).join("\n\n"),
        };
      }

      try {
        const useComparisons = pageData.targetKind === "preview" && comparisons.length > 0;
        const images = useComparisons
          ? comparisons.map((comparison) => ({
            label: `${comparison.name}: LEFT = anchor reference, RIGHT = your preview at the same relative position.`,
            url: comparison.url,
            filename: `${comparison.name.toLowerCase().replace(/\s+/g, "-")}.webp`,
          }))
          : screenshots.map((screenshot) => ({
            label: screenshot.name === FULL_PAGE_SCREENSHOT_NAME
              ? `Full page, top to bottom (${pageData.targetKind === "public" ? pageData.url : "your preview"}, ${pageData.pageHeight}px tall${pageData.captureTruncated ? ", cut off at the bottom" : ""})`
              : pageData.targetKind === "public"
                ? `Frame ${"frame" in screenshot ? screenshot.frame ?? "?" : "?"} of ${frames?.length ?? screenshots.length} (${pageData.url}, scrollY ${screenshot.scrollY}px, ${screenshot.scrollPercentage}%)`
                : `Your preview at scrollY ${screenshot.scrollY}px (${screenshot.scrollPercentage}%)`,
            url: screenshot.url,
            filename: `${screenshot.scrollPercentage}.webp`,
          }));
        const resolvedImages = await Promise.all(
          images.map(async (image) => ({
            image,
            resolved: await resolveGeneratedImageForModel(projectId, image.url),
          })),
        );

        await logger.write("web_scrape.model_evidence_prepared", {
          targetKind: pageData.targetKind,
          fileCount: resolvedImages.length,
          comparisons: useComparisons,
        });

        const instruction = pageData.targetKind === "public"
          ? designMode
            ? "These frames and measured DNA are design evidence. For original sites, study them and transfer composition principles into a new concept; do not copy the entire page, its words or claims. Only a clone or explicitly named style reference preserves the full design language."
            : "Inspect every attached screenshot directly and use the visible composition as the source of truth. Do not add gradients, backgrounds, effects, containers, decoration, or sections that are absent from the screenshots. Generate needed images from literal prompts describing only what you observed; no scraped source media is provided."
          : useComparisons
            ? "Compare each LEFT/RIGHT pair: surface colors, headline scale, section density and height, media size and placement, spacing, and button shape. Fix the measured gaps and the largest visible difference, then capture again before calling finishBuild."
            : "Inspect every attached preview frame for broken layout, empty or thin sections, unreadable contrast, missing media, and off-brief styling. Fix what you find before calling finishBuild.";

        return {
          type: "content" as const,
          value: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ...modelPageDataWithDirection,
                visualEvidence: { instruction },
              }),
            },
            ...(header ? [{ type: "text" as const, text: header }] : []),
            ...resolvedImages.flatMap(({ image, resolved }) => [
              { type: "text" as const, text: image.label },
              {
                type: "file" as const,
                data: { type: "data" as const, data: resolved.data },
                mediaType: resolved.mediaType,
                filename: modelAssetFilename(
                  resolved.assetId,
                  image.filename,
                ),
              },
            ]),
          ],
        };
      } catch (error) {
        return {
          type: "text" as const,
          value: JSON.stringify({
            ...modelPageDataWithDirection,
            error: toolError(
              "WEB_SCRAPE_SCREENSHOTS_DELIVERY_FAILED",
              error,
              "Use the render manifest and retry only if screenshots are required.",
            ),
          }),
        };
      }
    },
  });
};

function generatedFontProxyRoute(
  sources: Record<string, { url: string }>,
) {
  const serializedSources = JSON.stringify(sources, null, 2)
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return `const REFERENCE_SOURCES: Record<string, { url: string }> = ${serializedSources};

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await context.params;
  const source = REFERENCE_SOURCES[assetId];
  if (!source) {
    return Response.json({ error: "Reference font not found" }, { status: 404 });
  }

  try {
    const sourceUrl = source.url;
    const range = request.headers.get("range");
    const upstream = await fetch(sourceUrl, {
      cache: range ? "no-store" : "force-cache",
      headers: {
        Accept: "*/*",
        ...(range ? { Range: range } : {}),
      },
    });
    if (!upstream.ok || !upstream.body) {
      return Response.json(
        { error: "Reference font unavailable" },
        { status: upstream.status || 502 },
      );
    }
    const headers = new Headers({
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    const fallbackContentType = pathname.endsWith(".woff2")
      ? "font/woff2"
      : pathname.endsWith(".woff")
        ? "font/woff"
        : pathname.endsWith(".ttf")
          ? "font/ttf"
          : pathname.endsWith(".otf")
            ? "font/otf"
            : null;
    const contentType = upstream.headers.get("content-type") ?? fallbackContentType;
    if (contentType) {
      headers.set("Content-Type", contentType);
    }
    for (const name of [
      "Accept-Ranges",
      "Content-Range",
      "Content-Length",
      "ETag",
      "Last-Modified",
    ]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: "Reference font unavailable" }, { status: 502 });
  }
}
`;
}

function referenceFontNamespace(
  url: string,
  theme: "light" | "dark",
  viewport: z.infer<typeof viewportSchema>,
) {
  const fingerprint = JSON.stringify({
    url,
    theme,
    viewport,
  });
  return createHash("sha256").update(fingerprint).digest("hex").slice(0, 12);
}

export const importReferenceFonts = async ({
  projectId,
  signal,
  capture,
}: (Pick<ToolParams, "projectId" | "signal"> & { capture: WebScrapeCapture })) => {
  const seenFontSources = new Set<string>();
  const fontSources = capture.fonts
    .flatMap((font, fontIndex) =>
      font.sources.map((source, sourceIndex) => ({
        id: `font-${fontIndex + 1}-${sourceIndex + 1}`,
        sourceUrl: source.url,
        family: font.family,
        style: source.style,
        weight: source.weight,
        stretch: source.stretch,
        ...(source.format ? { format: source.format } : {}),
        ...(source.unicodeRange ? { unicodeRange: source.unicodeRange } : {}),
      })),
    )
    .filter(({ sourceUrl }) => {
      if (seenFontSources.has(sourceUrl)) return false;
      seenFontSources.add(sourceUrl);
      return true;
    });

  const references = fontSources.map((font) => ({
    ...font,
    source: { url: font.sourceUrl },
  }));

  if (references.length === 0) {
    return null;
  }

  const routePath = `app/b/${capture.namespace}/[assetId]/route.ts`;
  const assetPathPrefix = `/b/${capture.namespace}/`;

  await applyProjectChanges(
    projectId,
    [{
      type: "create",
      path: routePath,
      content: generatedFontProxyRoute(
        Object.fromEntries(
          references.map(({ id, source }) => [id, source]),
        ),
      ),
    }],
    { signal },
  );

  const modelFontReferences = fontSources.slice(0, 80).map(
    ({ id, family, style, weight, stretch, format, unicodeRange }) => ({
      id,
      family,
      style,
      weight,
      stretch,
      ...(format ? { format } : {}),
      ...(unicodeRange ? { unicodeRange } : {}),
      localPath: `${assetPathPrefix}${encodeURIComponent(id)}`,
    }),
  );

  return {
    routePath,
    assetPathPrefix,
    assetCount: 0,
    fontCount: fontSources.length,
    totalReferenceCount: references.length,
    fonts: modelFontReferences,
    fontReferencesTruncated: modelFontReferences.length < fontSources.length,
  } satisfies z.infer<typeof importedReferenceAssetsSchema>;
};
