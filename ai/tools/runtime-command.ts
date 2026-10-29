import z from "zod/v4";

import { STATUS } from "@/ai/message/data-part";
import type { ToolParams } from "@/ai/tools";
import {
  projectPathSchema,
  toolError,
  toolErrorSchema,
} from "@/ai/tools/schemas";
import { normalizeProjectPath } from "@/lib/project-path";
import type { RuntimeCommandInput } from "@/lib/runtime/protocol";
import { runProjectCommand } from "@/lib/runtime/runtime-service.server";

export const runtimeCommandOutputSchema = z.strictObject({
  status: z.enum(["success", "error"]),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().int().nonnegative(),
  timedOut: z.boolean(),
  outputTruncated: z.boolean(),
  changedFiles: z.array(
    z.strictObject({
      path: projectPathSchema,
      type: z.enum(["create", "write", "delete"]),
    }),
  ),
  error: toolErrorSchema.optional(),
});

type ToolRuntimeCommand = RuntimeCommandInput & {
  purpose: string;
};

export function reportCommandFailure(
  context: Pick<ToolParams, "writer">,
  input: ToolRuntimeCommand,
  toolCallId: string,
  code: string,
  error: unknown,
  recovery: string,
) {
  const message = error instanceof Error ? error.message : String(error);
  const shellData = {
    commandId: toolCallId,
    command: input.executable,
    args: input.args,
    purpose: input.purpose,
  };

  context.writer.write({
    id: toolCallId,
    type: "data-shell",
    data: {
      ...shellData,
      status: STATUS.ERROR,
      error: { message },
    },
  });

  return {
    status: "error" as const,
    exitCode: -1,
    stdout: "",
    stderr: message,
    durationMs: 0,
    timedOut: false,
    outputTruncated: false,
    changedFiles: [],
    error: toolError(code, error, recovery),
  };
}

function commandFailureMessage(result: {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}) {
  const summary = result.timedOut
    ? `Command timed out and exited with code ${result.exitCode}`
    : `Command exited with code ${result.exitCode}`;
  const detail = (result.stderr.trim() || result.stdout.trim()).slice(-2_000);
  return detail ? `${summary}\n${detail}` : summary;
}

export async function executeRuntimeCommand(
  context: ToolParams,
  input: ToolRuntimeCommand,
  toolCallId: string,
) {
  const { projectId, signal, writer } = context;
  const cwd = input.cwd === "." ? "." : normalizeProjectPath(input.cwd);
  const shellData = {
    commandId: toolCallId,
    command: input.executable,
    args: input.args,
    purpose: input.purpose,
  };

  writer.write({
    id: toolCallId,
    type: "data-shell",
    data: { ...shellData, status: STATUS.LOADING },
  });

  try {
    const execution = await runProjectCommand(
      projectId,
      {
        executable: input.executable,
        args: input.args,
        cwd,
        timeoutMs: input.timeoutMs,
      },
      signal,
    );
    const failureMessage =
      execution.exitCode === 0 ? null : commandFailureMessage(execution);

    const result = {
      status:
        execution.exitCode === 0 ? ("success" as const) : ("error" as const),
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr,
      durationMs: execution.durationMs,
      timedOut: execution.timedOut,
      outputTruncated: execution.outputTruncated,
      changedFiles: execution.changedFiles,
      ...(execution.exitCode === 0
        ? {}
        : {
            error: toolError(
              "COMMAND_EXITED_NONZERO",
              failureMessage,
              "Inspect stdout and stderr, change the implementation or command, and do not repeat an identical failing call.",
            ),
          }),
    };

    writer.write({
      id: toolCallId,
      type: "data-shell",
      data: {
        ...shellData,
        status: result.exitCode === 0 ? STATUS.COMPLETE : STATUS.ERROR,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        outputTruncated: result.outputTruncated,
        ...(result.exitCode === 0
          ? {}
          : { error: { message: commandFailureMessage(result) } }),
      },
    });

    return result;
  } catch (error) {
    return reportCommandFailure(
      { writer },
      input,
      toolCallId,
      "COMMAND_INFRASTRUCTURE_FAILURE",
      error,
      "Do not retry the identical call more than once. Use another tool or report the runtime blocker.",
    );
  }
}

function tail(value: string, limit: number) {
  return value.length <= limit
    ? value
    : `… earlier output omitted …\n${value.slice(-limit)}`;
}

export function commandToModelOutput({
  output,
}: {
  output: z.infer<typeof runtimeCommandOutputSchema>;
}) {
  return {
    type: "text" as const,
    value: JSON.stringify({
      ...output,
      stdout: tail(output.stdout, 12_000),
      stderr: tail(output.stderr, 12_000),
      modelOutputCompacted:
        output.stdout.length > 12_000 || output.stderr.length > 12_000,
    }),
  };
}
