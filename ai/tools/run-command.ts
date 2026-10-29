import { tool } from "ai";
import z from "zod/v4";

import type { ToolParams } from "@/ai/tools";
import {
  commandToModelOutput,
  executeRuntimeCommand,
  reportCommandFailure,
  runtimeCommandOutputSchema,
} from "@/ai/tools/runtime-command";
import { RUNTIME_EXECUTABLES } from "@/lib/runtime/protocol";
import { assertForegroundCommand } from "@/lib/runtime/command-policy";

const cwdSchema = z
  .string()
  .min(1)
  .max(500)
  .default(".")
  .describe("Project-relative working directory, or '.' for the project root.");

export const runCommand = ({ mode, ...context }: ToolParams) =>
  tool({
    description:
      "Run one foreground pnpm or Node.js command directly in the isolated project runtime without a shell. Use for package scripts, checks, tests, package management, code generation, and one-off project scripts. For missing shadcn components use `pnpm exec shadcn add <name> --yes` (never npx; `--yes` is required). Never start a persistent server; webScrape owns preview startup. Source changes remain available even when the command exits nonzero.",
    inputSchema: z.strictObject({
      executable: z
        .enum(RUNTIME_EXECUTABLES)
        .describe("Allowed executable: pnpm or node."),
      args: z
        .array(z.string().max(2_000))
        .min(1)
        .max(50)
        .describe(
          "Required argument vector passed directly to the executable; the whole command goes here, never in purpose. Never include shell quoting or operators. Typecheck: ['exec', 'tsc', '--noEmit']. With pnpm, use ['add', 'package'] to add a dependency and ['install'] only to restore declared dependencies.",
        ),
      cwd: cwdSchema,
      timeoutMs: z
        .number()
        .int()
        .min(1_000)
        .max(300_000)
        .default(120_000)
        .describe("Maximum foreground execution time in milliseconds."),
      purpose: z
        .string()
        .min(1)
        .max(160)
        .describe("Short user-facing reason for running this command."),
    }),
    outputSchema: runtimeCommandOutputSchema,
    execute: async (input, { toolCallId }) => {
      try {
        if (mode !== "BUILD") {
          throw new Error("Commands are disabled in plan mode");
        }
        assertForegroundCommand(input.executable, input.args);
        return executeRuntimeCommand({ ...context, mode }, input, toolCallId);
      } catch (error) {
        return reportCommandFailure(
          context,
          input,
          toolCallId,
          "COMMAND_REJECTED",
          error,
          "Correct the command arguments or use the specialized tool named in the error. Do not repeat the rejected input.",
        );
      }
    },
    toModelOutput: commandToModelOutput,
  });
