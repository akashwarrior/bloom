import { tool } from "ai";
import z from "zod/v4";

import type { ToolParams } from "@/ai/tools";
import { exploreProjectFiles } from "@/lib/runtime/runtime-service.server";
import {
  projectPathSchema,
  toolFailure,
  toolOutputSchema,
} from "@/ai/tools/schemas";

const outputSchema = z.strictObject({
  scripts: z.record(z.string(), z.string()),
  dependencies: z.record(z.string(), z.string()),
  devDependencies: z.record(z.string(), z.string()),
  routes: z.array(z.string()),
  keyFiles: z.array(projectPathSchema),
  changedPaths: z.array(projectPathSchema),
  truncated: z.boolean(),
});

export const exploreProject = ({
  projectId,
  signal,
}: Pick<ToolParams, "projectId" | "signal">) =>
  tool({
    description:
      "Explore the project structure, dependencies, scripts, routes, key files, and runtime changes. Use near the start of a broad task, then inspect relevant files with readFiles before creating replacements.",
    inputSchema: z.strictObject({}),
    outputSchema: toolOutputSchema(outputSchema),
    execute: async () => {
      try {
        return await exploreProjectFiles(projectId, signal);
      } catch (error) {
        return toolFailure(
          "PROJECT_EXPLORATION_FAILED",
          error,
          "Use listFiles and readFiles to explore the relevant project files directly.",
        );
      }
    },
  });
