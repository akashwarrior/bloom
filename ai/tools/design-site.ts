import { tool } from "ai";
import z from "zod/v4";

import { DesignPass } from "@/ai/design/design-pass";
import type { ToolParams } from "@/ai/tools";
import { toolFailure, toolOutputSchema, typeScriptValidationSchema, tscErrorSchema } from "@/ai/tools/schemas";
import { runDesignAgent } from "@/ai/design-agent";
import { resolveGeneratedImageForModel } from "@/lib/generated-assets.server";
import { modelAssetFilename } from "@/lib/model-asset-reference";

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
    references: z.array(z.strictObject({
      frame: z.number().int().positive(),
      url: z.string().startsWith("/api/assets/"),
      borrow: z.string(),
    })).max(3),
    next: z.string(),
  }),
);

/**
 * New builds and full redesigns. Runs the nested design director, which
 * studies the request, samples library frames, writes an art direction for
 * this project and applies it (tokens, fonts, component base, DESIGN.md)
 * before the main model builds the page. The main model receives the written
 * direction and the frames the director chose to show it.
 */
export const designSite = (context: Pick<ToolParams, "projectId" | "signal" | "writer" | "logger" | "session">) =>
  tool({
    description:
      "New builds and full redesigns. Runs Bloom's design director: it studies the user's request, attachments and any captured evidence, looks at sampled work from unrelated products, and writes an art direction for this project: the idea, the composition of the requested page, a color system, typefaces and how they are set, shape, imagery, motion and voice. Bloom applies it (tokens, fonts, component base) and writes DESIGN.md. Returns the full direction and any reference frames the director chose to show you. Before calling it, gather what the director needs to see: capture any site the user referenced with webScrape. Calling it when a design already exists replaces the whole design; use it only when the user rejects the current design or asks for a redesign, never for an edit. It does not name the brand or write copy; you do.",
    inputSchema: z.strictObject({}),
    outputSchema,
    execute: async (_input, { messages }) => {
      const { session, signal, writer, logger, projectId } = context;
      try {
        const replacedExistingDesign = Boolean(session.appliedDesign);
        const designPass = new DesignPass();

        const run = await runDesignAgent({
          projectId,
          signal,
          writer,
          logger,
          session,
          messages,
          designPass,
        });

        if (!run.result || run.result.status !== "applied") {
          const detail = (run.error
            ? run.error
            : run.result?.status === "error"
              ? run.result.error.message
              : run.text || "The design director finished without an applied design.").slice(0, 1_800);
          session.recordToolFailure("designSite", detail);

          return toolFailure(
            "DESIGN_SITE_INCOMPLETE",
            new Error(detail),
            session.abortReason
              ? "The workflow is stopping. Report this failure to the user."
              : "Call designSite once more. If it still fails, report the failure; never hand-write the design system.",
          );
        }

        if (!session.appliedDesign) {
          session.recordToolFailure("designSite", "The design tool reported success but no design was stored.");
          return toolFailure(
            "DESIGN_SITE_INCOMPLETE",
            new Error("The design tool reported success but no design was stored."),
            "Retry designSite once.",
          );
        }

        return {
          status: "success" as const,
          designDoc: "DESIGN.md" as const,
          replacedExistingDesign,
          files: run.result.files,
          validation: run.result.validation,
          tscError: run.result.tscError,
          warnings: run.result.warnings,
          brief: session.designDoc ?? "",
          references: session.designReferences.slice(0, 3),
          next: `${replacedExistingDesign ? "The previous design was replaced. " : ""}The direction is below and saved as DESIGN.md. Build the requested page from it: realize its composition, signature, type and color exactly rather than a familiar layout in its colors. You name the brand and write the copy in the voice it describes. The tokens and fonts are already applied; do not edit app/globals.css, app/layout.tsx, app/bloom-fonts.ts, components/ui, DESIGN.md or .bloom/design.json.`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        session.recordToolFailure("designSite", message);
        return toolFailure(
          "DESIGN_SITE_FAILED",
          error,
          session.abortReason
            ? "The workflow is stopping. Report this failure to the user."
            : "Retry designSite once. If it still fails, report the failure; do not hand-write app/globals.css or .bloom/design.json.",
        );
      }
    },
    toModelOutput: async ({ output }) => {
      if ("error" in output) return { type: "text" as const, value: JSON.stringify(output) };
      const { brief, references, ...summary } = output;
      const text = `${JSON.stringify(summary)}\n\n${brief}`;
      if (references.length === 0) return { type: "text" as const, value: text };
      const images = await Promise.all(references.map(async (reference) => ({
        reference,
        image: await resolveGeneratedImageForModel(context.projectId, reference.url).catch(() => null),
      })));
      return {
        type: "content" as const,
        value: [
          { type: "text" as const, text },
          {
            type: "text" as const,
            text: "Reference frames chosen by the director. Each shows a level of craft and one principle. They are other products, so take nothing else from them: not their words, names, colors or arrangement.",
          },
          ...images.flatMap(({ reference, image }) => [
            { type: "text" as const, text: `Frame ${reference.frame} — take only this: ${reference.borrow}` },
            ...(image
              ? [{
                type: "file" as const,
                data: { type: "data" as const, data: image.data },
                mediaType: image.mediaType,
                filename: modelAssetFilename(image.assetId, `direction-reference-${reference.frame}.webp`),
              }]
              : []),
          ]),
        ],
      };
    },
  });
