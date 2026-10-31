const MAX_DIAGNOSTIC_CHARACTERS = 6_000;
const MAX_DIAGNOSTIC_LINES = 30;

type TypecheckExecution = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  outputTruncated: boolean;
};

export type TypeScriptValidationReport = {
  status: "skipped" | "passed" | "failed" | "timed-out" | "unavailable";
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  outputTruncated: boolean;
};

export type TypeScriptValidationDiagnostic = {
  validation: TypeScriptValidationReport;
  tscError: string | null;
};

function boundedMessage(message: string) {
  return message.length <= MAX_DIAGNOSTIC_CHARACTERS
    ? message
    : `${message.slice(0, MAX_DIAGNOSTIC_CHARACTERS - 22)}\n… diagnostic truncated`;
}

function diagnosticLines(execution: TypecheckExecution) {
  const lines = `${execution.stdout}\n${execution.stderr}`
    .replaceAll(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const uniqueLines = [...new Set(lines)];
  const errors = uniqueLines.filter((line) =>
    /(?:\berror TS\d+\b|\bFound \d+ errors?\b)/i.test(line),
  );
  const usefulLines = errors.length > 0 ? errors : uniqueLines;
  const selected = usefulLines.slice(0, MAX_DIAGNOSTIC_LINES);
  if (usefulLines.length > selected.length) {
    selected.push(
      `… ${usefulLines.length - selected.length} additional diagnostic lines omitted`,
    );
  }
  return selected.join("\n");
}

export function summarizeTypeScriptValidation(
  execution: TypecheckExecution,
): TypeScriptValidationDiagnostic {
  const passed = execution.exitCode === 0 && !execution.timedOut;
  const status = execution.timedOut
    ? "timed-out"
    : passed
      ? "passed"
      : "failed";
  const validation: TypeScriptValidationReport = {
    status,
    exitCode: execution.exitCode,
    durationMs: execution.durationMs,
    timedOut: execution.timedOut,
    outputTruncated: execution.outputTruncated,
  };

  if (passed) return { validation, tscError: null };

  const summary = execution.timedOut
    ? "TypeScript check timed out. The source changes were preserved."
    : `TypeScript check exited with code ${execution.exitCode}. The source changes were preserved.`;
  const details = diagnosticLines(execution);
  return {
    validation,
    tscError: boundedMessage(details ? `${summary}\n${details}` : summary),
  };
}

export function unavailableTypeScriptValidation(
  error: unknown,
): TypeScriptValidationDiagnostic {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    validation: {
      status: "unavailable",
      exitCode: null,
      durationMs: 0,
      timedOut: false,
      outputTruncated: false,
    },
    tscError: boundedMessage(
      `TypeScript check could not run. The source changes were preserved.${detail ? `\n${detail}` : ""
      }`,
    ),
  };
}

export function skippedTypeScriptValidation(): TypeScriptValidationDiagnostic {
  return {
    validation: {
      status: "skipped",
      exitCode: null,
      durationMs: 0,
      timedOut: false,
      outputTruncated: false,
    },
    tscError: null,
  };
}
