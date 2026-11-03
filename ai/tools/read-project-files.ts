import { tool } from "ai";
import z from "zod/v4";

import type { ToolParams } from "@/ai/tools";
import { readProjectFiles as readRuntimeProjectFiles } from "@/lib/runtime/runtime-service.server";
import {
  projectPathSchema,
  toolFailure,
  toolOutputSchema,
} from "@/ai/tools/schemas";

const fileReadSchema = z.strictObject({
  path: projectPathSchema,
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("First 1-based line to return; omit to start at line 1."),
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Inclusive 1-based final line; omit to read to the response limit."),
});

const outputSchema = z.strictObject({
  files: z.array(
    z.discriminatedUnion("status", [
      z.strictObject({
        status: z.literal("ok"),
        path: projectPathSchema,
        content: z.string(),
        startLine: z.number().int().positive(),
        endLine: z.number().int().positive(),
        totalLines: z.number().int().nonnegative(),
        truncated: z.boolean(),
        nextStartLine: z.number().int().positive().optional(),
      }),
      z.strictObject({
        status: z.literal("error"),
        path: projectPathSchema,
        error: z.string(),
      }),
    ]),
  ),
});

export const readProjectFiles = ({ projectId, signal }: Pick<ToolParams, "projectId" | "signal">) =>
  tool({
    description:
      "Read current project text files from the runtime. Each returned line is prefixed with its 1-based line number and a tab (\"12\\t...\"). Use those numbers to locate text; copy the exact text without prefixes into `oldString` in applyChanges. Supports bounded line ranges. Read related small files together, use ranges for large files, and continue from nextStartLine whenever truncated.",
    inputSchema: z.strictObject({
      files: z
        .array(fileReadSchema)
        .min(1)
        .max(10)
        .describe("Files and optional line ranges to read."),
    }),
    outputSchema: toolOutputSchema(outputSchema),
    execute: async ({ files }) => {
      try {
        const result = await readRuntimeProjectFiles(projectId, files, signal);
        return {
          files: result.files.map((file) =>
            file.status === "ok" && file.content.length > 0
              ? {
                ...file,
                content: file.content
                  .split("\n")
                  .map((line, index) => `${file.startLine + index}\t${line}`)
                  .join("\n"),
              }
              : file,
          ),
        };
      } catch (error) {
        return toolFailure(
          "FILE_READ_FAILED",
          error,
          "Confirm the paths with listFiles and use valid line ranges before reading again.",
        );
      }
    },
  });
