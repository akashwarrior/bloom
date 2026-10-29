import { tool } from "ai";
import z from "zod/v4";

import type { ToolParams } from "@/ai/tools";
import { toolFailure, toolOutputSchema } from "@/ai/tools/schemas";
import { buildPageDna, compareDna, compareWithPrimaryReference, glyphOnlyContrast, heroImagery } from "@/lib/design/dna";
import { DESIGN_SYSTEM_MARKER } from "@/lib/design/design-system";
import { lintSourceChange, summarizeViolations } from "@/lib/design/lint";
import {
  captureProjectSourceSnapshot,
  validateProjectTypes,
} from "@/lib/runtime/runtime-service.server";
import { scrapeRenderedPage } from "@/lib/runtime/web-scrape.server";
import { critiqueBuild, type DesignCritique } from "@/ai/design-vision";
import { loadComparisonFrames } from "@/ai/tools/web-scrape";
import { resolveGeneratedImageForModel } from "@/lib/generated-assets.server";
import { evenlySelectItems } from "@/lib/evenly-select-items";
import { evaluateReviewQuality, MAX_FINISH_ATTEMPTS, type ReviewEvidence } from "@/lib/design/review-quality";
import { formatDesignStudy } from "@/lib/design/study";
import { plannedImageSections } from "@/lib/design/brief";

export { MAX_FINISH_ATTEMPTS } from "@/lib/design/review-quality";

const outputSchema = toolOutputSchema(
  z.strictObject({
    status: z.enum(["passed", "failed", "accepted-with-gaps"]),
    attempt: z.number().int().positive(),
    blocking: z.array(z.string()),
    major: z.array(z.string()),
    minor: z.array(z.string()),
    verified: z.array(z.string()),
    next: z.string(),
  }),
);

export const finishBuild = ({
  projectId,
  signal,
  logger,
  session,
}: Pick<ToolParams, "projectId" | "signal" | "logger" | "session">) =>
  tool({
    description:
      "Run the finish gate once every planned section is built and you have reviewed the preview. Bloom requires a successful typecheck, design-contract checks, desktop and mobile captures, and an independent visual review against the brief. A supplied clone/adaptation anchor is compared strictly; original references are research evidence only. Every blocking or major gap prevents passing, on all three attempts.",
    inputSchema: z.strictObject({
      selfReview: z
        .string()
        .trim()
        .min(20)
        .max(1_200)
        .describe("Your honest review of the latest desktop and mobile previews against the design intent (and the anchor for a clone/adaptation): what is complete and what still differs."),
    }),
    outputSchema,
    execute: async ({ selfReview }) => {
      try {
        if (session.finishAttempts >= MAX_FINISH_ATTEMPTS) {
          const passed = session.finishPassed && session.lastEditStep < session.lastFinishStep;
          session.finishPassed = passed;
          return {
            status: passed ? "passed" as const : "accepted-with-gaps" as const,
            attempt: session.finishAttempts,
            blocking: passed ? [] : ["The three finish attempts are exhausted. The current build has not passed verification."],
            major: session.finishReport.filter((line) => line.startsWith("Open: ")).map((line) => line.slice(6)),
            minor: [],
            verified: passed ? session.finishReport.filter((line) => !line.startsWith("Minor: ")) : [],
            next: "Write the final summary using only the completed verification results. State all open or unverified gaps; exhaustion is not a pass.",
          };
        }
        session.finishAttempts += 1;
        session.lastFinishStep = session.stepNumber;
        session.finishPassed = false;
        const attempt = session.finishAttempts;
        const blocking: string[] = [];
        const major: string[] = [];
        const minor: string[] = [];
        const verified: string[] = [];
        const evidence: ReviewEvidence = {
          typecheckStatus: null,
          desktop: { frames: 0, profile: false },
          mobile: { frames: 0, profile: false },
        };
        let critique: DesignCritique | null = null;
        const brief = session.brief;
        if (!brief) {
          blocking.push("No design brief exists. Submit it with submitDesignBrief first.");
        }

        const [types, snapshot] = await Promise.all([
          validateProjectTypes(projectId, signal),
          captureProjectSourceSnapshot(projectId, signal),
        ]);
        evidence.typecheckStatus = types.validation.status;
        if (types.validation.status === "failed") {
          blocking.push(`TypeScript errors:\n${(types.tscError ?? "").slice(0, 1_500)}`);
        } else if (types.validation.status === "passed") {
          verified.push("TypeScript check passed");
        }

        const file = (path: string) => snapshot.find((entry) => entry.path === path)?.content ?? null;
        const globals = file("app/globals.css") ?? "";
        if (!globals.includes(DESIGN_SYSTEM_MARKER)) {
          blocking.push("app/globals.css no longer contains the generated design system. Restore the tokens from the brief instead of rewriting globals.css.");
        }
        const page = file("app/page.tsx") ?? "";
        if (!page || page.includes("Your new project is ready")) {
          blocking.push("app/page.tsx is still the starter page. Compose it from the section components you built.");
        } else if (brief) {
          const unbuilt = session.pendingSections().map((section) => section.id);
          const uncomposed = brief.sections
            .filter((section) => !unbuilt.includes(section.id))
            .filter((section) => ![...session.writtenPaths].some((path) =>
              session.sectionForPath(path)?.id === section.id && page.includes(path.replace(/\.tsx$/, ""))))
            .map((section) => section.id);
          if (unbuilt.length > 0) blocking.push(`Planned sections are not built: ${unbuilt.join(", ")}. Write components/<id>.tsx for each.`);
          if (uncomposed.length > 0) blocking.push(`Built sections are missing from app/page.tsx: ${uncomposed.join(", ")}. Import and render them in plan order.`);
          if (unbuilt.length === 0 && uncomposed.length === 0) verified.push(`All ${brief.sections.length} planned sections are built and rendered in app/page.tsx`);
        }

        const reference = session.workflow === "clone" ? null : session.referenceCopy();
        const violations = snapshot.flatMap((entry) => lintSourceChange({
          path: entry.path,
          before: session.baselines.get(entry.path) ?? null,
          after: entry.content,
          reference,
        }));
        if (violations.length > 0) {
          blocking.push(`${violations.length} design-contract violation(s) remain:\n${summarizeViolations(violations, 12).join("\n")}`);
        } else {
          verified.push("Current source passed the design-contract checks");
        }

        const sources = snapshot.filter((entry) => /\.(?:tsx|ts|css)$/.test(entry.path)).map((entry) => entry.content).join("\n");
        const pendingImages = session.pendingAssetSlots();
        if (pendingImages.length > 0) {
          blocking.push(`Image placeholders are still waiting for images: ${pendingImages.map((slot) => `asset:${slot.name} (${slot.aspect}, ${slot.paths.join(", ")})`).join("; ")}. Generate each with generateAsset using that exact name, or replace the placeholder with a code-built visual.`);
        }
        if (brief) {
          const plannedImages = plannedImageSections(brief);
          const placed = [...new Set(session.generatedAssets.map((asset) => asset.localPath))]
            .map((path) => ({ path, uses: sources.split(path).length - 1 }))
            .filter((image) => image.uses > 0);
          if (plannedImages.length > 0 && placed.length < Math.min(plannedImages.length, 2)) {
            major.push(`The brief plans generated imagery for ${plannedImages.map((section) => section.id).join(", ")}, but ${placed.length} generated image(s) are on the page. Write src="asset:<name>" where each planned image belongs and generate it with generateAsset.`);
          }
        }
        if (brief && !sources.includes(brief.brand.name)) {
          major.push(`The brand name "${brief.brand.name}" does not appear in the source. Use it in the navigation, hero, and footer.`);
        }

        if (session.reviews.length === 0) {
          blocking.push(`You have not reviewed the preview. Capture \`/\` with webScrape, ${session.comparisonAnchor ? "compare it with the anchor frames" : "judge it against the design intent"}, and fix visible gaps first.`);
        }

        if (brief) {
          const anchor = session.comparisonAnchor;
          if (!anchor && (session.workflow === "clone" || session.reference)) {
            blocking.push("The required clone/adaptation reference is unavailable. Reference fidelity has not been verified.");
          }
          const comparisonFrames = anchor ? await loadComparisonFrames(projectId, anchor) : [];
          if (anchor && comparisonFrames.length === 0) {
            blocking.push("The comparison anchor's screenshots are unavailable. Reference fidelity has not been verified.");
          }
          const desktop = await scrapeRenderedPage({
              projectId,
              signal,
              url: "/",
              theme: brief.theme === "dark" ? "dark" : "light",
              viewport: "desktop",
              includeScreenshots: true,
              maxScreenshots: 16,
              comparisonFrames,
            });
          const mobile = await scrapeRenderedPage({
              projectId,
              signal,
              url: "/",
              theme: brief.theme === "dark" ? "dark" : "light",
              viewport: "mobile",
              includeScreenshots: true,
              maxScreenshots: 16,
            });
          for (const [viewport, capture] of [["desktop", desktop], ["mobile", mobile]] as const) {
            evidence[viewport] = { frames: capture.screenshots.length, profile: Boolean(capture.designProfile) };
            if (capture.blocked || capture.status >= 400 || capture.status <= 0) {
              blocking.push(`The ${viewport} preview could not be loaded successfully (HTTP ${capture.status}${capture.blocked ? ", blocked" : ""}).`);
            }
            if (capture.captureTruncated) {
              minor.push(`The ${viewport} capture reports limited frame or manifest evidence; visual conclusions cover only the supplied screenshots.`);
            }
            const lastFrame = capture.screenshots.at(-1);
            if (lastFrame && lastFrame.scrollY + capture.viewport.height + 4 < capture.pageHeight) {
              blocking.push(`The ${viewport} screenshots stop at ${lastFrame.scrollY + capture.viewport.height}px of a ${capture.pageHeight}px page. Capture the missing end of the page before accepting it.`);
            }
            const runtimeErrors = (capture.diagnostics ?? []).filter((diagnostic) => diagnostic.kind === "runtime");
            if (runtimeErrors.length > 0) {
              blocking.push(`The ${viewport} preview reports runtime errors: ${runtimeErrors.slice(0, 3).map((diagnostic) => diagnostic.message).join(" | ")}`);
            }
            const otherErrors = [...new Set((capture.diagnostics ?? [])
              .filter((diagnostic) => diagnostic.kind !== "runtime")
              .map((diagnostic) => `${diagnostic.kind}: ${diagnostic.message.slice(0, 300)}${diagnostic.url ? ` (${diagnostic.url})` : ""}`))];
            if (otherErrors.length > 0) {
              major.push(`The ${viewport} preview reports ${otherErrors.length} console or network error(s): ${otherErrors.slice(0, 4).join(" | ")}`);
            }
            if (capture.designProfile) {
              const overflow = capture.designProfile.overflowX;
              if (overflow > 4) {
                blocking.push(`The ${viewport} page at ${capture.viewport.width}px overflows horizontally by ${overflow}px. Stack grids, clamp display text, and remove fixed widths where needed.`);
              } else {
                verified.push(`Measured ${viewport} horizontal overflow is ${overflow}px at ${capture.viewport.width}px width (within the 4px tolerance)`);
              }
            }
          }
          if (anchor && desktop.comparisons.length === 0) {
            blocking.push("No anchor/preview comparison images were produced. Reference fidelity has not been reviewed.");
          }
          if (desktop.frameAnalyses.length === 0) {
            blocking.push("Desktop pixel measurements are unavailable. The brief's rendered theme and surfaces have not been verified.");
          } else if (desktop.designProfile) {
            const dna = buildPageDna({
              frames: desktop.frameAnalyses,
              profile: desktop.designProfile,
              pageHeight: desktop.pageHeight,
              viewportHeight: desktop.viewport.height,
            });
            const fonts = session.briefFonts;
            const gaps = compareDna({
              preview: dna,
              previewProfile: desktop.designProfile,
              anchor: anchor?.dna ?? null,
              expected: {
                theme: brief.theme,
                surfaceColors: brief.colors.surfaces.map((surface) => surface.background),
                displaySize: brief.typography.display.sizePx,
                displayFamily: fonts?.display.kind === "google" ? fonts.display.entry.family : fonts?.display.family ?? brief.typography.display.family,
                bodyFamily: fonts?.body.kind === "google" ? fonts.body.entry.family : fonts?.body.family ?? brief.typography.body.family,
              },
            });
            const primary = session.original ? session.anchor : null;
            if (primary) {
              gaps.push(...compareWithPrimaryReference({
                preview: dna,
                previewHeroImagery: heroImagery(desktop.frameAnalyses, desktop.manifest?.fidelity.criticalAssets ?? [], desktop.viewport, desktop.designProfile),
                reference: primary,
                requestedTheme: session.requestedTheme,
              }));
            }
            for (const gap of gaps) {
              (gap.severity === "blocking" ? blocking : gap.severity === "major" ? major : minor).push(gap.message);
            }
            if (!gaps.some((gap) => gap.severity !== "minor")) {
              if (primary) verified.push(`Measured against the primary reference ${primary.host}: theme family, display scale and hero imagery are within range`);
              verified.push(
                `Desktop style measurements met the checked brief thresholds: ${dna.theme} theme, ${dna.surfaceColors.length} surface color(s), display ${dna.type.display?.size ?? "?"}px in ${dna.type.display?.family ?? "?"}`,
              );
            }
          }
          if (mobile.designProfile?.lowContrast && mobile.designProfile.lowContrast.count > 0) {
            const contrast = mobile.designProfile.lowContrast;
            (glyphOnlyContrast(contrast) ? minor : blocking).push(`The mobile preview has ${contrast.count} nearly invisible text element(s): ${contrast.examples.slice(0, 4).map((example) => `"${example.text}" ${example.color} on ${example.background} (${example.ratio}:1, y=${example.y}px)`).join("; ")}. Pair each background with its intended foreground token.`);
          }
          const repeated = desktop.designProfile?.repeatedImage;
          if (repeated && repeated.count > 2) {
            major.push(`The same image (${repeated.src}) is shown ${repeated.count} times, so those cards read as placeholders. Give each card its own generated image (one asset: placeholder per card) or a code-built visual.`);
          }
          if (mobile.designProfile?.textOverflow && mobile.designProfile.textOverflow.count > 0) {
            const overflow = mobile.designProfile.textOverflow;
            major.push(`On mobile, ${overflow.count} text element(s) run past their box: ${overflow.examples.slice(0, 4).map((example) => `"${example.text}" by ${example.overflow}px (y=${example.y}px)`).join("; ")}. Scale that type down at small widths or let the text wrap.`);
          }
          if (mobile.designProfile && mobile.designProfile.images.broken > 0) {
            blocking.push(`${mobile.designProfile.images.broken} image(s) failed to load on mobile. Fix the image URLs and responsive sources.`);
          }

          await logger.write("finish_build.capture", {
            anchor: anchor?.url ?? null,
            screenshots: desktop.screenshots.length,
            mobileScreenshots: mobile.screenshots.length,
            comparisons: desktop.comparisons.length,
            pageHeight: desktop.pageHeight,
          });
          const frames = desktop.fullPage ? [desktop.fullPage] : evenlySelectItems(desktop.screenshots, 6);
          const mobileFrames = mobile.fullPage ? [mobile.fullPage] : evenlySelectItems(mobile.screenshots, 6);
          if (frames.length > 0 && mobileFrames.length > 0) {
            const references = session.original && session.designStudy
              ? (await Promise.all(session.designStudy.references.map(async (source) => {
                const reference = session.findReference(source.url);
                const frame = reference?.frames.find((candidate) => candidate.number === source.frame);
                const resolved = frame
                  ? await resolveGeneratedImageForModel(projectId, frame.assetUrl).catch(() => null)
                  : null;
                if (!resolved) {
                  minor.push(`Research image ${source.url}, frame ${source.frame} is unavailable; no visual benchmark comparison with that reference was verified.`);
                  return null;
                }
                return {
                  label: source.url,
                  bytes: resolved.data,
                  mediaType: resolved.mediaType,
                };
              }))).filter((reference) => reference !== null)
              : [];
            const intent = [
              session.designStudy ? formatDesignStudy(session.designStudy) : "",
              `Brand voice: ${brief.brand.voice}. Signature: ${brief.signature}. Visual treatment: ${brief.imagery}`,
              "Planned sections (verify their rendered presence and media, not component imports or filenames):",
              ...brief.sections.map((section) => `${section.id}: ${section.purpose}. Composition: ${section.composition}. Media: ${section.media ?? "No image required; typography or code-built content is valid"}.`),
            ].filter(Boolean).join("\n");
            critique = await critiqueBuild({
              comparisons: evenlySelectItems(desktop.comparisons, 6).map((comparison) => ({ bytes: comparison.bytes, mediaType: "image/webp" })),
              frames: frames.map((frame) => ({ bytes: frame.bytes, mediaType: frame.mimeType })),
              mobileFrames: mobileFrames.map((frame) => ({ bytes: frame.bytes, mediaType: frame.mimeType })),
              references,
              intent,
              brand: brief.brand.name,
              signature: brief.signature,
              logger,
              signal,
            });
            await logger.write("finish_build.critique", { critique });
          }
        }

        const result = evaluateReviewQuality({ critique, evidence, attempt, blocking, major, minor });
        const { passed, exhausted } = result;
        session.finishPassed = passed;
        session.finishReport = [
          ...verified,
          ...result.blocking.map((gap) => `Open: ${gap}`),
          ...result.major.map((gap) => `Open: ${gap}`),
          ...result.minor.map((gap) => `Minor: ${gap}`),
        ];
        await logger.write("finish_build.result", {
          attempt,
          passed,
          exhausted,
          blocking: result.blocking,
          major: result.major,
          minor: result.minor,
          selfReview,
        });

        return {
          status: passed ? "passed" as const : exhausted ? "accepted-with-gaps" as const : "failed" as const,
          attempt,
          blocking: result.blocking,
          major: result.major,
          minor: result.minor,
          verified,
          next: passed
            ? "The build passed. Write the final summary now; claim only what is listed under verified."
            : exhausted
              ? "Finish attempts are exhausted and the build did not pass. Write the final summary and state every open or unverified gap plainly; do not claim quality was accepted or that the gaps were fixed."
              : `Fix every blocking and major item (largest visual gap first), capture \`/\` again to confirm, then call finishBuild. Attempts left: ${MAX_FINISH_ATTEMPTS - attempt}.`,
        };
      } catch (error) {
        session.finishPassed = false;
        session.finishReport = [`Open: Finish verification could not complete: ${error instanceof Error ? error.message : String(error)}`];
        session.recordToolFailure("finishBuild", error instanceof Error ? error.message : String(error));
        return toolFailure(
          "FINISH_BUILD_FAILED",
          error,
          session.finishAttempts >= MAX_FINISH_ATTEMPTS
            ? "Finish attempts are exhausted. State that verification did not complete; do not claim the build passed."
            : "Restore the preview and verification services, then call finishBuild again. Unavailable checks are not a pass.",
        );
      }
    },
  });
