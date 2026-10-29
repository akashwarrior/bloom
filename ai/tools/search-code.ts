import { tool } from "ai";
import z from "zod/v4";

import type { ToolParams } from "@/ai/tools";
import { searchProjectFiles } from "@/lib/runtime/runtime-service.server";
import {
  globSchema,
  projectPathSchema,
  toolFailure,
  toolOutputSchema,
} from "@/ai/tools/schemas";

const outputSchema = z.strictObject({
  matches: z.array(
    z.strictObject({
      path: projectPathSchema,
      line: z.number().int().positive(),
      column: z.number().int().positive(),
      preview: z.string(),
    }),
  ),
  searchedFiles: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export const searchCode = ({ projectId, signal }: Pick<ToolParams, "projectId" | "signal">) =>
  tool({
    description:
      "Search current runtime source files with bounded surrounding context. Prefer literal mode for symbols and exact text; use regex only when literal search cannot express the query. Narrow with globs when possible and check truncated before assuming every usage was found.",
    inputSchema: z.strictObject({
      query: z
        .string()
        .min(1)
        .max(1_000)
        .describe("Literal text or a safe regular expression, according to mode."),
      mode: z
        .enum(["literal", "regex"])
        .default("literal")
        .describe("How query is interpreted."),
      globs: z
        .array(globSchema)
        .max(10)
        .optional()
        .describe("Optional inclusive file globs; omit to search all source files."),
      caseSensitive: z
        .boolean()
        .default(false)
        .describe("Whether letter casing must match exactly."),
      contextLines: z
        .number()
        .int()
        .min(0)
        .max(10)
        .default(1)
        .describe("Surrounding lines returned before and after each match."),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Maximum matches returned."),
    }),
    outputSchema: toolOutputSchema(outputSchema),
    execute: async (input) => {
      try {
        return await searchProjectFiles(projectId, input, signal);
      } catch (error) {
        return toolFailure(
          "CODE_SEARCH_FAILED",
          error,
          "Use literal mode or a simpler regular expression, and narrow the search with valid project globs.",
        );
      }
    },
  });
