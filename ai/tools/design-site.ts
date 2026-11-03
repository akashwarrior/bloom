import { tool } from "ai";
import { z } from "zod";

import type { ToolParams } from "@/ai/tools";
import { toolFailure, toolOutputSchema, typeScriptValidationSchema, tscErrorSchema } from "@/ai/tools/schemas";
import { runDesignAgent } from "@/ai/design-agent";
import { resolveGeneratedImageForModel } from "@/ai/generated-assets.server";
import { modelAssetFilename } from "@/ai/context/asset-reference";

const outputSchema = toolOutputSchema(
  z.strictObject({
    status: z.literal("success"),
    designDoc: z.literal("DESIGN.md"),
    replacedExistingDesign: z.boolean(),
    files: z.array(z.string()),
    validation: typeScriptValidationSchema,
    tscError: tscErrorSchema,
    warnings: z.array(z.string()),
    /** The full DESIGN.md, so the builder starts from the direction without another read. */
    brief: z.string(),
    /** Project image URL of the first screen rendered from the direction, when one could be made. */
    study: z.string().nullable(),
  }),
);

/**
 * New builds and full redesigns. Runs the nested design director, which
 * studies the request and what the main agent says the screen must contain, writes an art
 * direction for this project and applies it (tokens, fonts, DESIGN.md) before the main model builds the page. The main model receives
 * the written direction.
 */
export const designSite = (context: Pick<ToolParams, "projectId" | "signal" | "writer" | "logger" | "session">) => {
  let failures = 0;
  return tool({
    description:
      "New builds and full redesigns. Runs Bloom's design director: it studies the user's request, attachments, what you say the screen has to contain and any captured evidence, and writes an art direction for this project: the idea, the composition of the requested page, a palette, typefaces and how they are set, shape and control size, imagery, motion and voice. Bloom saves it as DESIGN.md and generates nothing else: the stylesheet, theme and layout are yours to write from it. Returns the full direction and a study of the first screen rendered from it; nothing needs to be read again afterwards. Call it by itself: files written in the same step are rejected, because they could not have followed the direction. Calling it when a design already exists replaces the direction; use it only when the user rejects the current design or asks for a redesign, never for an edit. It does not choose the page route, name the brand or write copy; you do.",
    inputSchema: z.strictObject({
      focus: z.string().trim().min(1).max(800).describe("What the visitor is here to do and what this screen has to contain for that: the real content, data and controls, most important first. Name only content the request supplies or implies, never ratings, customer counts, logos or testimonials nobody provided. Leave the look and the arrangement to the director; a layout written here limits what it can design."),
      interaction: z.string().trim().min(1).max(300).nullable().describe("Choose one primary action and its observable result. For an external service choose a locally testable state. Use null for a purely presentational experience."),
    }),
    outputSchema,
    execute: async (review, { messages }) => {
      const { session, signal, writer, logger, projectId } = context;
      if (failures >= 2) {
        return toolFailure(
          "DESIGN_SITE_RETRY_LIMIT",
          "Design setup failed twice during this run.",
          "Report the last failure and leave the workspace available for the user to retry.",
        );
      }
      try {
        const replacedExistingDesign = Boolean(session.appliedDirection);

        const run = await runDesignAgent({
          projectId,
          signal,
          writer,
          logger,
          session,
          messages,
          focus: review.focus,
        });

        if (!run.result || run.result.status !== "applied") {
          failures++;
          const detail = (run.error
            ? run.error
            : run.result?.status === "error"
              ? run.result.error.message
              : run.text || "The design director finished without an applied design.").slice(0, 1_800);

          return toolFailure(
            "DESIGN_SITE_INCOMPLETE",
            new Error(detail),
            "Call designSite once more. If it still fails, report the failure instead of building without a direction.",
          );
        }

        if (!session.appliedDirection) {
          failures++;
          return toolFailure(
            "DESIGN_SITE_INCOMPLETE",
            new Error("The design tool reported success but no design was stored."),
            "Retry designSite once.",
          );
        }

        failures = 0;
        session.review = review;
        session.designResultUnread = true;
        session.previewImages.clear();
        return {
          status: "success" as const,
          designDoc: "DESIGN.md" as const,
          replacedExistingDesign,
          files: run.result.files,
          validation: run.result.validation,
          tscError: run.result.tscError,
          warnings: run.result.warnings,
          brief: session.designDoc ?? "",
          study: session.conceptUrl,
        };
      } catch (error) {
        failures++;
        return toolFailure(
          "DESIGN_SITE_FAILED",
          error,
          "Retry designSite once. If it still fails, report the failure instead of building without a direction.",
        );
      }
    },
    toModelOutput: async ({ output }) => {
      if ("error" in output) return { type: "text" as const, value: JSON.stringify(output) };
      const { brief, study, ...summary } = output;
      const text = `${JSON.stringify(summary)}\n\n${brief}\n\nThis is DESIGN.md in full. Nothing has to be read or listed before building: write the theme and the page from it.`;
      const image = study ? await resolveGeneratedImageForModel(context.projectId, study).catch(() => null) : null;
      if (!image) return { type: "text" as const, value: text };
      return { type: "content" as const, value: [
        { type: "text" as const, text: `${text}\n\nThe image is a study of the first screen, rendered from this direction. Build the direction; the study shows one way it can look, and where the two differ the direction decides. Adapt it to each screen size. Crop clean artwork from it with generateAsset; for a subject hidden by lettering or another object, request the unobstructed image. It accompanies new image requests in this run as visual context. Its project image URL is ${study}. Never place the whole study in the page.` },
        { type: "file" as const, data: { type: "data" as const, data: image.data }, mediaType: image.mediaType, filename: modelAssetFilename(image.assetId, image.filename) },
      ] };
    },
  });
};
