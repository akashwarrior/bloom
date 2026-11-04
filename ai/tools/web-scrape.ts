import { tool } from "ai";
import { z } from "zod";

import type { ToolParams } from "@/ai/tools";
import { scrapeRenderedPage } from "@/lib/runtime/web-scrape.server";
import { toolError, toolFailure, toolOutputSchema } from "@/ai/tools/schemas";
import {
  resolveGeneratedImageForModel,
  storeGeneratedImageAsset,
} from "@/ai/generated-assets.server";
import { modelAssetFilename } from "@/ai/context/asset-reference";
import { evenlySelectItems } from "@/ai/context/visual-evidence";

const INITIAL_MODEL_SCREENSHOTS = 10;
const PUBLIC_REF_SCREENSHOTS = 5;
const PREVIEW_SCREENSHOTS = 6;

const screenshotSchema = z.strictObject({
  name: z.string(),
  url: z.string().startsWith("/api/assets/"),
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
  fonts: z.array(z.string()).max(80),
  colors: capturedColorsSchema,
  screenshots: z.array(screenshotSchema).max(INITIAL_MODEL_SCREENSHOTS),
});

const previewOutputSchema = z.strictObject({
  review: z.object({ focus: z.string(), interaction: z.string().nullable() }).optional(),
  placeholderLinks: z.array(z.string()).optional(),
  /** Set when the interaction stopped early or missed its expected result. */
  interactionError: z.string().optional(),
  diagnostics: z.array(browserDiagnosticSchema).max(10).nullable(),
  screenshots: z.array(screenshotSchema).max(INITIAL_MODEL_SCREENSHOTS),
});

const outputSchema = toolOutputSchema(
  z.union([publicOutputSchema, previewOutputSchema]),
);

type PreviewContext = Pick<ToolParams, "projectId" | "signal" | "session">;

/** Captures a project route without interaction and records it as the current preview of that viewport. */
export async function capturePreview({ projectId, signal, session }: PreviewContext, url: string, viewport: "desktop" | "mobile") {
  const version = session.editVersion;
  const scrape = await scrapeRenderedPage({ projectId, signal, url, theme: "light", viewport });
  if (scrape.status <= 0 || scrape.status >= 400 || scrape.blocked || !scrape.fullPage) return false;
  const asset = await storeGeneratedImageAsset({
    projectId, filename: "current-preview-full-page.webp", mediaType: scrape.fullPage.mimeType, bytes: scrape.fullPage.bytes,
  });
  if (version !== session.editVersion) return false;
  session.recordPreview(viewport, [{ url: asset.url, label: scrape.fullPage.name }], url);
  if (viewport === "desktop") session.previewText = scrape.previewText ?? "";
  return true;
}

/** Runs the interaction the builder already proved, on the current source. */
export async function replayInteraction({ projectId, signal, session }: PreviewContext) {
  const { interaction } = session;
  if (!interaction) return false;
  const version = session.editVersion;
  const scrape = await scrapeRenderedPage({ projectId, signal, theme: "light", ...interaction });
  if (scrape.interactionError) throw new Error(scrape.interactionError);
  if (version !== session.editVersion) return false;
  session.recordInteraction();
  return true;
}

export const webScrape = ({
  projectId,
  signal,
  logger,
  session,
}: Pick<ToolParams, "projectId" | "signal" | "logger" | "session">) =>
  tool({
    description:
      "Inspect a rendered page. Pass a project route such as `/` or `/login` to see browser diagnostics and a full-page screenshot. Use viewport `mobile` to inspect the phone layout; ask for desktop and mobile in the same step. Use deep_scrape for content revealed by scrolling. With `actions` it operates the page and shows the state it reaches. A public URL returns fonts, colors and screenshots for a requested reference.",
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
      actions: z.array(z.strictObject({
        selector: z.string().trim().min(1).max(300).describe("CSS selector for a visible control from the project source, such as #email, [data-slot='dialog-trigger'] or input[type='email']; or the control's exact visible text, such as Open account."),
        fill: z.string().max(400).nullable().describe("Fill this value, or use null to click the control."),
      })).max(8).default([]).describe("Optional steps on the current project only. Use fictional input to inspect a task's result. Each capture starts in a fresh browser context."),
      expectVisible: z.string().trim().min(1).max(300).nullable().default(null).describe("For an interaction, what must be visible afterwards: a CSS selector specific to the resulting state, such as [data-slot='dialog-content'] or [role='alert'], or the exact text that state shows."),
    }),
    outputSchema,
    execute: async ({ url, theme, viewport, deep_scrape, actions, expectVisible: expected }) => {
      const expectVisible = expected && !/^(?:null|none|undefined)$/i.test(expected) ? expected : null;
      try {
        const version = session.editVersion;
        const scrape = await scrapeRenderedPage({
          projectId,
          signal,
          url,
          theme,
          viewport,
          deep: deep_scrape,
          actions,
          expectVisible,
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

        const frames = evenlySelectItems(
          scrape.screenshots,
          scrape.targetKind === "public" ? PUBLIC_REF_SCREENSHOTS : PREVIEW_SCREENSHOTS,
        );
        if (scrape.fullPage) frames.push(scrape.fullPage);
        const screenshots = await Promise.all(frames.map(async (frame, index) => {
          const suffix = frame === scrape.fullPage ? "full-page" : String(index + 1);
          const asset = await storeGeneratedImageAsset({
            projectId,
            filename: `${screenshotLabel}-${suffix}.webp`,
            mediaType: frame.mimeType,
            bytes: frame.bytes,
          });
          return { name: frame.name, url: asset.url };
        }));

        if (scrape.targetKind === "preview") {
          if (pageUsable && screenshots.length && version === session.editVersion) {
            if (actions.length && expectVisible && !scrape.interactionError) session.recordInteraction({ url, viewport, actions, expectVisible });
            else if (!actions.length && (viewport === "desktop" || viewport === "mobile")) {
              session.recordPreview(viewport, screenshots.map(frame => ({
                url: frame.url,
                label: frame.name,
              })), url);
              if (viewport === "desktop") session.previewText = scrape.previewText ?? "";
            }
          }
          return {
            ...(scrape.placeholderLinks?.length ? { placeholderLinks: scrape.placeholderLinks } : {}),
            ...(scrape.interactionError ? { interactionError: scrape.interactionError } : {}),
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

        // Keep the public reference so the next direction can cite it.
        session.designReferences = [{
          imageId: new URL(scrape.url).hostname,
          assetUrl: screenshots[0]!.url,
          number: 1,
          batch: 1,
        }];
        return {
          fonts: scrape.design?.fonts ?? [],
          colors: scrape.design?.colors ?? [],
          screenshots,
        } satisfies z.infer<typeof publicOutputSchema>;
      } catch (error) {
        return toolFailure(
          "WEB_SCRAPE_FAILED",
          error,
          actions.length
            ? "Check the route and the selectors. Each capture begins from the initial page state."
            : "Check that the URL is valid and reachable. A public website may block Chromium or the server IP.",
        );
      }
    },
    toModelOutput: async ({ input, output }) => {
      if ("error" in output) {
        return { type: "text" as const, value: JSON.stringify(output) };
      }

      const publicCapture = "fonts" in output;
      const interacted = Boolean(input.actions?.length);
      const fullPageCapture =
        !interacted && input.deep_scrape !== true && output.screenshots.length <= 1;
      const evidence = publicCapture
        ? { url: input.url, fonts: output.fonts, colors: output.colors }
        : {
          url: input.url, viewport: input.viewport, interacted, diagnostics: output.diagnostics,
          ...(output.interactionError ? { interactionFailed: output.interactionError } : {}),
          ...(output.placeholderLinks?.length ? {
            linksPointingToHash: output.placeholderLinks,
            review: "These visible links target only #. Inspect their handlers. Remove each nonfunctional link or give it the requested behavior before finishing. A link that only prevents the default click has no behavior.",
          } : {}),
        };

      const images = output.screenshots.map((screenshot, index) => ({
        label: fullPageCapture
          ? "Full page"
          : publicCapture
            ? `Screenshot ${index + 1}/${output.screenshots.length}: ${screenshot.name}`
            : `Preview screenshot ${index + 1}/${output.screenshots.length}: ${screenshot.name}`,
        url: screenshot.url,
        filename: fullPageCapture ? "full-page.webp" : `screenshot-${index + 1}.webp`,
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
