import { tool } from "ai";
import z from "zod/v4";

import { critiqueBlockers, MAX_CRITIQUE_ROUNDS, runDesignCritic } from "@/ai/design-critic";
import type { ToolParams } from "@/ai/tools";
import { toolFailure, toolOutputSchema } from "@/ai/tools/schemas";
import { lintSourceChange, summarizeViolations } from "@/lib/design/lint";
import {
  captureProjectSourceSnapshot,
  validateProjectTypes,
} from "@/lib/runtime/runtime-service.server";

const MAX_FINISH_ATTEMPTS = 3;

const outputSchema = toolOutputSchema(
  z.strictObject({
    status: z.enum(["passed", "failed"]),
    attempt: z.number().int().positive(),
    blocking: z.array(z.string()).max(20),
    verified: z.array(z.string()).max(20),
    /** What the design reviewer said already works; keep it while revising. */
    keep: z.array(z.string()).max(4).optional(),
    next: z.string(),
  }),
);

/**
 * Final verification. It checks the current source, not the model's summary:
 * typecheck, design-contract violations, pending image placeholders, the page
 * route edited in this run, and whether desktop and mobile previews were
 * captured after the latest source write.
 */
export const finishBuild = ({
  projectId,
  signal,
  session,
  logger,
}: Pick<ToolParams, "projectId" | "signal" | "session" | "logger">) => {
  let attempts = 0;

  return tool({
    description:
      "Verify the finished build. Run it only after the final edit, with desktop and mobile previews captured by webScrape. It checks the full TypeScript build, the design checks, pending image placeholders, the page route edited in this run, and that both previews are newer than the last source write. When a design was created in this run, an independent design reviewer then looks at those captures against the direction and may ask for revisions. A failed result blocks completion: fix every listed item, capture both viewports again and call it again.",
    inputSchema: z.strictObject({}),
    outputSchema,
    execute: async () => {
      attempts += 1;
      const attempt = attempts;
      const blocking: string[] = [];
      const verified: string[] = [];

      try {
        const [types, snapshot] = await Promise.all([
          validateProjectTypes(projectId, signal),
          captureProjectSourceSnapshot(projectId, signal),
        ]);

        if (types.validation.status === "passed") {
          verified.push("TypeScript check passed");
        } else {
          blocking.push(
            `TypeScript verification did not pass (${types.validation.status}).${types.tscError ? `\n${types.tscError.slice(0, 1_500)}` : ""}`,
          );
        }

        const design = session.appliedDesign;
        if (session.requiresDesign && !design) {
          blocking.push("No design system has been applied. Call designSite before finishing.");
        }

        const pagePath = session.lastPagePath;
        if (pagePath) {
          if (snapshot.some((file) => file.path === pagePath)) {
            verified.push(`Page route exists at ${pagePath}`);
          } else {
            blocking.push(`The page edited in this run, ${pagePath}, does not exist.`);
          }
        } else if (snapshot.some((file) => /^app\/(?:.*\/)?page\.tsx$/.test(file.path))) {
          verified.push("A page route exists in app/");
        } else {
          blocking.push("No app route page exists. Build the page before finishing.");
        }

        if (design) {
          const reference = session.referenceCopy();
          const violations = snapshot.flatMap((file) =>
            /\.(?:[cm]?[jt]sx?|mdx)$/i.test(file.path)
              ? lintSourceChange({
                path: file.path,
                before: session.baselines.get(file.path) ?? null,
                after: file.content,
                reference,
              })
              : [],
          );
          if (violations.length > 0) {
            blocking.push(
              `${violations.length} design-contract violation(s) remain:\n${summarizeViolations(violations, 12).join("\n")}`,
            );
          } else {
            verified.push("Current source passed the design-contract checks");
          }
        }

        const pendingImages = session.pendingAssetSlots();
        if (pendingImages.length > 0) {
          blocking.push(
            `Image placeholders are still waiting for images: ${pendingImages.map((slot) => `asset:${slot.name} (${slot.paths.join(", ")})`).join("; ")}. Generate each with generateAsset using that exact name, or replace the placeholder with a code-built visual.`,
          );
        } else {
          verified.push("No image placeholders are waiting for generated assets");
        }

        if (session.hasEdits) {
          for (const viewport of ["desktop", "mobile"] as const) {
            if (session.previewIsCurrent(viewport)) {
              verified.push(`${viewport} preview was captured after the final source write`);
            } else {
              blocking.push(
                `The ${viewport} preview is missing or older than the latest source write. Capture the built route with webScrape viewport "${viewport}" after the final edit.`,
              );
            }
          }
        }

        // Design review: only once the page is mechanically sound, only for a
        // design made in this run, and never more than MAX_CRITIQUE_ROUNDS times.
        let keep: string[] | undefined;
        const designDoc = snapshot.find((file) => file.path === "DESIGN.md")?.content;
        if (
          blocking.length === 0 &&
          session.designedThisRun &&
          session.appliedDesign?.direction &&
          designDoc &&
          session.critiqueRounds < MAX_CRITIQUE_ROUNDS
        ) {
          const round = session.critiqueRounds + 1;
          const critique = await runDesignCritic({
            projectId,
            signal,
            logger,
            request: session.requestText,
            designDoc,
            round,
            shots: { desktop: session.previewShots("desktop"), mobile: session.previewShots("mobile") },
          }).catch(async (error) => {
            await logger.write("design_critic.failed", { error });
            return null;
          });
          if (!critique) {
            verified.push("The design review was unavailable, so the page was not reviewed by the design reviewer");
          } else {
            session.critiqueRounds = round;
            keep = critique.keep;
            session.revisionsRequested = critique.verdict === "revise" && critique.issues.length > 0;
            if (session.revisionsRequested) {
              // A review is not a failed verification attempt; it does not use one up.
              attempts -= 1;
              return {
                status: "failed" as const,
                attempt,
                blocking: critiqueBlockers(critique).slice(0, 20),
                verified,
                keep,
                next: `The build is sound, but the design reviewer asks for revisions (review ${round} of ${MAX_CRITIQUE_ROUNDS}). First impression: ${critique.firstImpression} Make each change properly rather than minimally, keep what is listed under keep, then capture desktop and mobile again and call finishBuild.`,
              };
            }
            verified.push(`The design reviewer approved the page against the direction (review ${round})`);
            for (const issue of critique.issues) verified.push(`Reviewer note, not blocking: ${issue.where}: ${issue.problem}`);
          }
        }

        if (blocking.length === 0 && keep === undefined && session.designedThisRun && session.revisionsRequested) {
          verified.push("The revisions requested in the last design review were made but not reviewed again");
        }

        if (blocking.length === 0) {
          return {
            status: "passed" as const,
            attempt,
            blocking,
            verified: verified.slice(0, 20),
            next: "Verification passed. Write the final summary now and claim only what is listed under verified.",
          };
        }

        const remaining = Math.max(0, MAX_FINISH_ATTEMPTS - attempt);
        return {
          status: "failed" as const,
          attempt,
          blocking: blocking.slice(0, 20),
          verified,
          next: remaining > 0
            ? `Fix every blocking item, capture the route again if the source changed, then call finishBuild again. Attempts left: ${remaining}.`
            : "Finish attempts are exhausted. Do not claim the build passed; state every open gap plainly in the final summary.",
        };
      } catch (error) {
        session.recordToolFailure(
          "finishBuild",
          error instanceof Error ? error.message : String(error),
        );
        return toolFailure(
          "FINISH_BUILD_FAILED",
          error,
          "This is an environment failure, not a reason to skip verification. Retry finishBuild once; if it still fails, report the unverified build to the user.",
        );
      }
    },
  });
};
