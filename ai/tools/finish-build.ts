import { tool } from "ai";
import z from "zod/v4";

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
}: Pick<ToolParams, "projectId" | "signal" | "session">) => {
  let attempts = 0;

  return tool({
    description:
      "Verify the finished build. Run it only after the final edit, with desktop and mobile previews captured by webScrape. It checks the full TypeScript build, design-contract violations, pending image placeholders, the page route edited in this run, and that both previews are newer than the last source write. A failed result blocks completion: fix every listed item and call it again, up to three attempts.",
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

        if (blocking.length === 0) {
          return {
            status: "passed" as const,
            attempt,
            blocking,
            verified,
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
