import { tool } from "ai";
import z from "zod/v4";

import type { ToolParams } from "@/ai/tools";
import {
  FULL_PAGE_SCREENSHOT_NAME,
  scrapeRenderedPage,
} from "@/lib/runtime/web-scrape.server";
import { toolError, toolFailure, toolOutputSchema } from "@/ai/tools/schemas";
import {
  resolveGeneratedImageForModel,
  storeGeneratedImageAsset,
} from "@/lib/generated-assets.server";
import { modelAssetFilename } from "@/lib/model-asset-reference";
import { evenlySelectItems } from "@/lib/evenly-select-items";
import { buildPageDna } from "@/lib/design/dna";
import { brandFromHost } from "@/ai/build-session";

const INITIAL_MODEL_SCREENSHOTS = 10;
const PUBLIC_REF_SCREENSHOTS = 5;
const PREVIEW_SCREENSHOTS = 6;
const CAPTURE_SCREENSHOTS = 16;

const screenshotSchema = z.strictObject({
  name: z.string(),
  url: z.string().startsWith("/api/assets/"),
  scrollY: z.number().int().nonnegative(),
  scrollPercentage: z.number().int().min(0).max(100),
  frame: z.number().int().positive().optional(),
});

const summaryFontSchema = z.strictObject({
  family: z.string(),
  style: z.string(),
  weight: z.string(),
});

const capturedColorsSchema = z.array(z.string()).max(24);

const browserDiagnosticSchema = z.strictObject({
  kind: z.enum(["console", "runtime", "request-failed", "http"]),
  severity: z.literal("error"),
  message: z.string().min(1).max(800),
  url: z.string().max(500).optional(),
  status: z.number().int().min(100).max(599).optional(),
});

const publicOutputSchema = z.strictObject({
  fonts: z.array(summaryFontSchema).max(80),
  colors: capturedColorsSchema,
  screenshots: z.array(screenshotSchema).max(INITIAL_MODEL_SCREENSHOTS),
});

const previewOutputSchema = z.strictObject({
  diagnostics: z.array(browserDiagnosticSchema).max(10).nullable(),
  screenshots: z.array(screenshotSchema).max(INITIAL_MODEL_SCREENSHOTS),
});

const outputSchema = toolOutputSchema(
  z.union([publicOutputSchema, previewOutputSchema]),
);

export const webScrape = ({
  projectId,
  signal,
  logger,
  session,
}: Pick<ToolParams, "projectId" | "signal" | "logger" | "session">) =>
  tool({
    description:
      "Capture a rendered page. Public URLs return the page's fonts, colors and screenshots; use the screenshots as the source of truth for composition and styling, and transfer design principles instead of copying its content. Pass the current project preview as a relative path (for example `/` or `/login`) to return browser diagnostics and screenshots of the built page. Screenshots are always captured: one full-page image, or viewport frames when deep_scrape is set. Use viewport `mobile` on the preview to check responsive overflow.",
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
          "Viewport for this capture.",
        ),
      deep_scrape: z
        .boolean()
        .default(false)
        .describe(
          "Scroll the page and attach one screenshot per viewport instead of a single full-page image. Use only for scroll-animated, scroll-revealed, canvas or WebGL pages whose content renders blank or unrevealed in the full-page capture.",
        ),
    }),
    outputSchema,
    execute: async ({ url, theme, viewport, deep_scrape }) => {
      try {
        const scrape = await scrapeRenderedPage({
          projectId,
          signal,
          url,
          theme,
          viewport,
          includeScreenshots: true,
          deep: deep_scrape,
          maxScreenshots: CAPTURE_SCREENSHOTS,
        });

        const pageUnavailable = scrape.status <= 0 || scrape.status >= 400;
        const pageUsable = !pageUnavailable && !scrape.blocked;
        if (scrape.targetKind === "public" && !pageUsable) {
          return toolFailure(
            "WEB_SCRAPE_UNAVAILABLE",
            `The page returned ${scrape.status > 0 ? `HTTP ${scrape.status}` : "no HTTP response"}${scrape.blocked ? " and was blocked" : ""}, so it is not usable design evidence.`,
            "Retry once, or choose a different reference site.",
          );
        }

        const screenshotLabel = scrape.targetKind === "public" ? "public-reference" : "current-preview";

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
              scrollY: screenshot.scrollY,
              scrollPercentage: screenshot.scrollPercentage,
            };
          }),
        );

        const numberedScreenshots = storedScreenshots.map((screenshot, index) => ({
          ...screenshot,
          frame: index + 1,
        }));

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

        const screenshots = fullPage
          ? [fullPage]
          : representativeScreenshots.map((screenshot) => ({
            name: screenshot.name,
            url: screenshot.url,
            scrollY: screenshot.scrollY,
            scrollPercentage: screenshot.scrollPercentage,
            frame: screenshot.frame,
          }));

        if (scrape.targetKind === "preview") {
          if (!pageUnavailable && !scrape.blocked && (viewport === "desktop" || viewport === "mobile")) {
            session.recordPreview(viewport);
          }
          return {
            diagnostics: scrape.diagnostics,
            screenshots,
          } satisfies z.infer<typeof previewOutputSchema>;
        }

        if (screenshots.length === 0) {
          return toolFailure(
            "WEB_SCRAPE_UNAVAILABLE",
            `The page at ${scrape.url} produced no screenshots, so it is not usable design evidence.`,
            "Retry once with deep_scrape, or choose a different reference site.",
          );
        }

        const dna = scrape.frameAnalyses.length > 0 || scrape.designProfile
          ? buildPageDna({
            frames: scrape.frameAnalyses,
            profile: scrape.designProfile,
            pageHeight: scrape.pageHeight,
          })
          : null;

        if (pageUsable && numberedScreenshots.length > 0 && dna) {
          const host = new URL(scrape.url).hostname.replace(/^www\./, "");
          session.recordReference({
            url: scrape.url,
            host,
            brand: brandFromHost(host),
            dna,
            headings: [
              ...new Set([
                ...scrape.title.split(/\s+[|\u2013\u2014-]\s+/),
                ...(scrape.designProfile?.headings ?? []),
                ...(scrape.designProfile?.prominentTexts ?? []),
              ]),
            ]
              .filter((text) => text.trim().length > 0)
              .slice(0, 160),
          });
          await logger.write("web_scrape.reference_recorded", {
            url: scrape.url,
            screenshots: numberedScreenshots.length,
            theme: dna.theme,
            surfaces: dna.surfaces.length,
          });
        }

        return {
          fonts: scrape.design?.fonts ?? [],
          colors: scrape.design?.colors ?? [],
          screenshots,
        } satisfies z.infer<typeof publicOutputSchema>;
      } catch (error) {
        return toolFailure(
          "WEB_SCRAPE_FAILED",
          error,
          "Check that the URL is valid and reachable. A public website may block Chromium or the server IP.",
        );
      }
    },
    toModelOutput: async ({ input, output }) => {
      if ("error" in output) {
        return { type: "text" as const, value: JSON.stringify(output) };
      }

      const publicCapture = "fonts" in output;
      const evidence = publicCapture
        ? { url: input.url, fonts: output.fonts, colors: output.colors }
        : { url: input.url, diagnostics: output.diagnostics };

      const images = output.screenshots.map((screenshot) => ({
        label: screenshot.name === FULL_PAGE_SCREENSHOT_NAME
          ? `Full page, top to bottom (${input.url})`
          : publicCapture
            ? `Frame ${screenshot.frame ?? "?"} of ${output.screenshots.length} (${input.url}, scrollY ${screenshot.scrollY}px, ${screenshot.scrollPercentage}%)`
            : `Your preview at scrollY ${screenshot.scrollY}px (${screenshot.scrollPercentage}%)`,
        url: screenshot.url,
        filename: `${screenshot.scrollPercentage}.webp`,
      }));

      if (images.length === 0) {
        return {
          type: "text" as const,
          value: JSON.stringify(evidence),
        };
      }

      try {
        const resolvedImages = await Promise.all(
          images.map(async (image) => ({
            image,
            resolved: await resolveGeneratedImageForModel(projectId, image.url),
          })),
        );

        await logger.write("web_scrape.model_evidence_prepared", {
          targetKind: publicCapture ? "public" : "preview",
          fileCount: resolvedImages.length,
        });

        return {
          type: "content" as const,
          value: [
            { type: "text" as const, text: JSON.stringify(evidence) },
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
            ...evidence,
            error: toolError(
              "WEB_SCRAPE_SCREENSHOTS_DELIVERY_FAILED",
              error,
              "Retry the capture.",
            ),
          }),
        };
      }
    },
  });
