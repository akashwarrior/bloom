import { tool } from "ai";
import { createPatch } from "diff";
import { z } from "zod";

import { critiqueBlockers, MAX_CRITIQUE_ROUNDS, runDesignCritic } from "@/ai/design-critic";
import { requestText } from "@/ai/request-text";
import type { ToolParams } from "@/ai/tools";
import { inspectRender } from "@/ai/design/inspect-render";
import { toolFailure, toolOutputSchema } from "@/ai/tools/schemas";
import { capturePreview, replayInteraction } from "@/ai/tools/web-scrape";
import { lintSourceChange, summarizeViolations } from "@/ai/design/lint";
import {
  captureProjectSourceSnapshot,
  validateProjectTypes,
} from "@/lib/runtime/runtime-service.server";
import type { RuntimeFile } from "@/lib/runtime/protocol";

/** The preview route of a page file: `app/(marketing)/pricing/page.tsx` is `/pricing`. */
function routeOf(pagePath: string | null) {
  const segments = (pagePath ?? "app/page.tsx").split("/").slice(1, -1).filter((segment) => !/^\(.*\)$/.test(segment));
  return `/${segments.join("/")}`;
}

/** Steps a round of design revisions needs; with fewer left the review would only cut the run off. */
const REVISION_STEPS = 25;

const outputSchema = toolOutputSchema(
  z.strictObject({
    status: z.enum(["passed", "failed"]),
    attempt: z.number().int().positive(),
    blocking: z.array(z.string()).max(20),
    verified: z.array(z.string()).max(20),
    /** What the design reviewer said already works; keep it while revising. */
    keep: z.array(z.string()).max(4).optional(),
    warnings: z.array(z.string()).optional(),
  }),
);

function reviewSourceChanges(snapshot: RuntimeFile[], baselines: Map<string, string | null>) {
  const current = new Map(snapshot.map(file => [file.path, file]));
  const excerpts: string[] = [];
  let remaining = 10_000;
  let omitted = 0;
  for (const [path, before] of baselines) {
    if (!/\.(?:[cm]?[jt]sx?|mdx|css)$/.test(path) || /(?:\.min\.|\.generated\.|\.d\.ts$)/.test(path)) continue;
    const file = current.get(path);
    const after = file?.content ?? null;
    if (before === after) continue;
    if (file?.encoding === "base64" || remaining === 0 || (before?.length ?? 0) + (after?.length ?? 0) > 100_000) {
      omitted += 1;
      continue;
    }
    const patch = createPatch(path, before ?? "", after ?? "", "before", "after", {
      context: 2, timeout: 50,
    });
    if (!patch) {
      omitted += 1;
      continue;
    }
    const length = Math.min(remaining, 2_500);
    excerpts.push(patch.length > length ? patch.slice(0, length) + "\n[Excerpt truncated]" : patch);
    remaining -= Math.min(length, patch.length);
  }
  if (omitted) excerpts.push(`Omitted source changes: ${omitted}.`);
  return excerpts.join("\n\n");
}

/**
 * Final verification. It checks the current source, not the model's summary:
 * typecheck, design-contract violations, the page
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
  let renderReview: { version: number; correction: string | null; observation?: string; warning?: string } | undefined;

  return tool({
    description:
      "Verify the finished build. Run it after the final edit. It checks the full TypeScript build, design-contract violations and the page route edited in this run, then captures desktop and mobile itself and replays the interaction you exercised with webScrape on the final source, so you do not need to capture again before calling it. One independent reviewer then looks at those captures: against the direction when a design was created in this run, against the requested change otherwise. A failed result blocks completion: fix every listed item and call it again. After three failed attempts, report every open gap and do not claim the build passed.",
    inputSchema: z.strictObject({}),
    outputSchema,
    execute: async (_input, { messages }) => {
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
          session.recordTypecheckPassed();
        } else {
          blocking.push(
            `TypeScript verification did not pass (${types.validation.status}).${types.tscError ? `\n${types.tscError.slice(0, 1_500)}` : ""}`,
          );
        }

        const design = session.appliedDirection;
        if (!design) {
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
          const violations = snapshot.flatMap((file) =>
            /\.(?:[cm]?[jt]sx?|mdx)$/i.test(file.path)
              ? lintSourceChange({
                path: file.path,
                before: session.baselines.get(file.path) ?? null,
                after: file.content,
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

        // The final state is captured here, so an edit after the builder's own captures costs no extra round.
        if (session.hasEdits && blocking.length === 0) {
          const route = session.previewUrl ?? routeOf(pagePath);
          for (const viewport of ["desktop", "mobile"] as const) {
            if (!session.previewIsCurrent(viewport)) {
              await capturePreview({ projectId, signal, session }, route, viewport).catch(async (error) => {
                signal.throwIfAborted();
                await logger.write("finish_build.capture_failed", { error });
              });
            }
            if (session.previewIsCurrent(viewport)) {
              verified.push(`${viewport} preview was captured after the final source write`);
            } else {
              blocking.push(`The ${viewport} preview of ${route} could not be captured. Open it with webScrape viewport "${viewport}", fix what its diagnostics report, and call finishBuild again.`);
            }
          }
          if (session.review?.interaction && blocking.length === 0) {
            let failure = "";
            if (!session.interactionIsCurrent && session.interaction) {
              await replayInteraction({ projectId, signal, session }).catch((error) => {
                signal.throwIfAborted();
                failure = ` (${(error instanceof Error ? error.message : String(error)).slice(0, 300)})`;
              });
            }
            if (session.interactionIsCurrent) {
              verified.push("The preview interaction reaches its expected result on the final source");
            } else if (session.interaction) {
              blocking.push(`The interaction that reached ${session.interaction.expectVisible} earlier no longer does after the latest edits${failure}. Fix it and exercise it again with webScrape actions and expectVisible: ${session.review.interaction}`);
            } else {
              blocking.push(`Exercise the task once with webScrape actions and set expectVisible to the selector for the expected result, then call finishBuild again: ${session.review.interaction}`);
            }
          }
        }

        // One reviewer per run: the design reviewer for a design made in this run, the change review otherwise.
        const designDoc = snapshot.find((file) => file.path === "DESIGN.md")?.content;
        const directed = Boolean(session.designedThisRun && session.appliedDirection && designDoc);
        if (!blocking.length && !directed && (session.review || session.hasEdits) && renderReview?.version !== session.editVersion) {
          const version = session.editVersion;
          const priorCorrection = renderReview?.correction ?? undefined;
          try {
            const review = await inspectRender(
              projectId,
              session,
              messages,
              AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
              reviewSourceChanges(snapshot, session.baselines),
              priorCorrection,
            );
            renderReview = {
              version,
              observation: review.observation,
              correction: review.decision === "revise" ? review.reason : null,
            };
            await logger.write("design.reviewed", { status: review.decision, attempt });
          } catch (error) {
            signal.throwIfAborted();
            await logger.write("design.review_unavailable", { error, attempt });
            renderReview = {
              version, correction: priorCorrection ?? null,
              warning: priorCorrection
                ? `The visual review was unavailable. This finding remains unverified: ${priorCorrection}`
                : "The independent visual review was unavailable.",
            };
          }
          if (version !== session.editVersion) blocking.push("The source changed during review. Capture the updated screen and verify again.");
        }
        if (renderReview?.version === session.editVersion) {
          if (renderReview.observation) verified.push(`Visual review: ${renderReview.observation}`);
          if (renderReview.correction && !renderReview.warning) blocking.push(renderReview.correction);
        }
        const reviewDue = blocking.length === 0 && directed && designDoc && session.critiqueRounds < MAX_CRITIQUE_ROUNDS;
        if (reviewDue && session.stepsLeft < REVISION_STEPS) {
          verified.push("The design review was skipped because the run is close to its step limit");
        } else if (reviewDue) {
          const round = session.critiqueRounds + 1;
          const critique = await runDesignCritic({
            projectId,
            signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
            logger,
            request: requestText(messages),
            designDoc,
            round,
            shots: { desktop: session.previewShots("desktop"), mobile: session.previewShots("mobile") },
            pageText: session.previewText,
            replacedOpening: session.replacedOpening,
            before: session.reviewedShots,
          }).catch(async (error) => {
            signal.throwIfAborted();
            await logger.write("design_critic.failed", { error });
            return null;
          });
          if (!critique) {
            verified.push("The design review was unavailable, so the page was not reviewed by the design reviewer");
          } else {
            session.critiqueRounds = round;
            session.reviewedShots = session.previewShots("desktop");
            session.revisionsRequested = Boolean(critique.unsupportedClaims) || (critique.verdict === "revise" && critique.issues.length > 0);
            if (session.revisionsRequested) {
              // A review is not a failed verification attempt; it does not use one up.
              attempts -= 1;
              const revisions = [
                `The build is sound, but the design reviewer asks for revisions (review ${round} of ${MAX_CRITIQUE_ROUNDS}). First impression: ${critique.firstImpression} Make these changes and keep what is listed under keep. If a change would cover content or make the page worse, leave that part as it was and say so. Then call finishBuild.`,
                ...critiqueBlockers(critique),
              ];
              session.lastVerificationFailure = revisions.join("\n").slice(0, 1600);
              return {
                status: "failed" as const,
                attempt,
                blocking: revisions.slice(0, 20),
                verified,
                keep: critique.keep,
              };
            }
            verified.push(`The design reviewer approved the page against the direction (review ${round})`);
            for (const issue of critique.issues) verified.push(`Reviewer note, not blocking: ${issue.where}: ${issue.problem}`);
          }
        } else if (blocking.length === 0 && session.designedThisRun && session.revisionsRequested) {
          verified.push("The revisions requested in the last design review were made but not reviewed again");
        }

        if (blocking.length === 0) {
          session.recordVerification();
          return {
            status: "passed" as const,
            attempt,
            blocking,
            verified: verified.slice(0, 20),
            ...(renderReview?.warning ? { warnings: [renderReview.warning] } : {}),
          };
        }

        session.lastVerificationFailure = blocking.join("\n").slice(0, 1600);
        return {
          status: "failed" as const,
          attempt,
          blocking: blocking.slice(0, 20),
          verified,
        };
      } catch (error) {
        return toolFailure(
          "FINISH_BUILD_FAILED",
          error,
          "This is an environment failure, not a reason to skip verification. Retry finishBuild once; if it still fails, report the unverified build to the user.",
        );
      }
    },
  });
};
