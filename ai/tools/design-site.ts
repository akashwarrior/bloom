import { tool } from "ai";
import z from "zod/v4";

import { DesignPass } from "@/ai/design/design-pass";
import type { ToolParams } from "@/ai/tools";
import { toolFailure, toolOutputSchema, typeScriptValidationSchema, tscErrorSchema } from "@/ai/tools/schemas";
import { runDesignAgent } from "@/ai/design-agent";

const outputSchema = toolOutputSchema(
  z.strictObject({
    status: z.literal("success"),
    designDoc: z.literal("DESIGN.md"),
    replacedExistingDesign: z.boolean(),
    files: z.array(z.string()),
    validation: typeScriptValidationSchema,
    tscError: tscErrorSchema,
    warnings: z.array(z.string()),
    next: z.string(),
  }),
);

/**
 * New builds and full redesigns. Runs the nested design director, which
 * samples fresh library frames as needed, chooses a shadcn create preset, and
 * applies the complete design system before the main model builds the page.
 * It does not choose the page route, brand, copy or layout.
 */
export const designSite = (context: Pick<ToolParams, "projectId" | "signal" | "writer" | "logger" | "session">) =>
  tool({
    description:
      "New builds and full redesigns. Runs Bloom's design director: it studies the user's request, attachments and any captured evidence, samples design-library frames when useful, chooses a valid shadcn create preset, and applies it with `shadcn apply`, which owns app/globals.css, the fonts and components/ui. Bloom then writes DESIGN.md and .bloom/design.json. Calling it when a design already exists replaces the entire design system, including tokens, fonts, icons, menus and DESIGN.md; use it only when the current design is rejected or clearly wrong, not for a small edit. Returns generated files, typecheck result, warnings and a pointer to DESIGN.md. It does not choose the page route, brand, copy or layout; the main agent owns those.",
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
          next: `${replacedExistingDesign ? "The previous design system was replaced. " : ""}DESIGN.md is updated with the applied shadcn preset, resolved tokens and inspiration references. Read it now, then build the page the user asked for. It does not prescribe the page composition, brand, copy or layout. shadcn apply owns app/globals.css, the fonts and components/ui; Bloom owns DESIGN.md and .bloom/design.json. Do not edit any of them by hand.`,
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
  });
