import { tool } from "ai";
import { z } from "zod";

import type { ToolParams } from "@/ai/tools";
import { toolFailure, toolOutputSchema } from "@/ai/tools/schemas";
import { formatUiDocs, UI_DOCS_SCRIPT, type UiDocsResult } from "@/ai/design/ui-docs";
import { runProjectCommand } from "@/lib/runtime/runtime-service.server";

const pageSchema = z.strictObject({
  name: z.string(),
  section: z.string().nullable(),
  content: z.string(),
  otherSections: z.array(z.string()),
  truncated: z.boolean(),
});

const outputSchema = toolOutputSchema(z.strictObject({
  pages: z.array(pageSchema),
  unknown: z.array(z.string()),
  available: z.array(z.string()),
}));

export const uiDocs = ({ projectId, signal }: Pick<ToolParams, "projectId" | "signal">) =>
  tool({
    description:
      "Read ui-sdk's documentation for the version installed in this project. For a component (button, field, input, select, dialog, tabs, accordion, checkbox, switch, slider, menu, popover, tooltip, toast and the rest) it returns what the component is, a working example with its imports, how its parts nest, and the data attributes to style from, then names the page's other sections. Pass `section` to read one of those in full, such as Forms, Animation or API Reference. Guides are read the same way: forms, popups, styling-and-animation, server-rendering. Ask for every component you are about to use in one call.",
    inputSchema: z.strictObject({
      pages: z.array(z.strictObject({
        name: z.string().trim().min(1).max(60).describe("Component or guide name, such as dialog, select or popups."),
        section: z.string().trim().min(1).max(80).nullable().default(null).describe("A section of that page to read in full, by its heading. Use null for the overview."),
      })).min(1).max(12),
    }),
    outputSchema,
    execute: async ({ pages }) => {
      try {
        const run = await runProjectCommand(projectId, {
          executable: "node",
          args: ["-e", UI_DOCS_SCRIPT, JSON.stringify(pages)],
          cwd: ".",
          timeoutMs: 30_000,
        }, signal);
        if (run.exitCode !== 0) throw new Error((run.stderr || run.stdout).trim().slice(-600) || "The documentation could not be read.");
        return JSON.parse(run.stdout) as UiDocsResult;
      } catch (error) {
        signal.throwIfAborted();
        return toolFailure(
          "UI_DOCS_UNAVAILABLE",
          error,
          "Retry once. If it still fails, build with the parts shown in the system prompt and check the result with webScrape.",
        );
      }
    },
    toModelOutput: ({ output }) => ({
      type: "text" as const,
      value: "error" in output ? JSON.stringify(output) : formatUiDocs(output),
    }),
  });
