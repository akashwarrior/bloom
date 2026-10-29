import { tool } from "ai";
import z from "zod/v4";

import type { ToolParams } from "@/ai/tools";
import { listProjectFiles } from "@/lib/runtime/runtime-service.server";
import {
  globSchema,
  projectPathSchema,
  toolFailure,
  toolOutputSchema,
} from "@/ai/tools/schemas";

const outputSchema = z.strictObject({
  files: z.array(
    z.strictObject({
      path: projectPathSchema,
      bytes: z.number().int().nonnegative(),
    }),
  ),
  truncated: z.boolean(),
  nextCursor: z.string().optional(),
});

export const listFiles = ({ projectId, signal }: Pick<ToolParams, "projectId" | "signal">) =>
  tool({
    description:
      "List current project files matching one or more globs. Use this when the compact project snapshot or code search is insufficient. Generated directories, dependencies, caches, coverage, and build output are always excluded. Continue with nextCursor when truncated.",
    inputSchema: z.strictObject({
      patterns: z
        .array(globSchema)
        .min(1)
        .max(10)
        .describe("Inclusive globs; use the narrowest patterns that answer the question."),
      exclude: z
        .array(globSchema)
        .max(10)
        .optional()
        .describe("Additional project-relative exclusion globs."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(300)
        .default(150)
        .describe("Maximum paths returned in this page."),
      cursor: z
        .string()
        .max(500)
        .optional()
        .describe("Opaque nextCursor from a previous identical listing."),
    }),
    outputSchema: toolOutputSchema(outputSchema),
    execute: async (input) => {
      try {
        return await listProjectFiles(projectId, input, signal);
      } catch (error) {
        return toolFailure(
          "FILE_LIST_FAILED",
          error,
          "Use simpler or narrower globs. Remove the cursor if it came from a different listing.",
        );
      }
    },
  });
