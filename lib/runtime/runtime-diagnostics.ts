import type { RuntimeDiagnostic } from "@/lib/runtime/protocol";

const ERROR_PATTERN =
  /(?:^|\b)(?:error|failed|failure|exception|unhandled|cannot find|module not found)(?:\b|:)/i;
const WARNING_PATTERN = /(?:^|\b)warn(?:ing)?(?:\b|:)/i;

const ANSI_ESCAPE_SEQUENCE =
  /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\)|[@-_])/g;

const MAX_RENDERED_OUTPUT_LENGTH = 100_000;

export function normalizeRuntimeOutput(out: string) {
  const plainText = out
    .replaceAll("\r\n", "\n")
    .replace(ANSI_ESCAPE_SEQUENCE, "");
  const completedLines: string[] = [];
  let currentLine = "";

  for (const character of plainText) {
    if (character === "\n") {
      completedLines.push(currentLine);
      currentLine = "";
    } else if (character === "\r") {
      // Terminal progress indicators rewrite the current line.
      currentLine = "";
    } else if (character === "\b") {
      currentLine = currentLine.slice(0, -1);
    } else if (
      character === "\t" ||
      character.charCodeAt(0) >= 0x20
    ) {
      currentLine += character;
    }
  }

  const output = [...completedLines, currentLine].join("\n");
  return output.length > MAX_RENDERED_OUTPUT_LENGTH
    ? `… earlier output omitted …\n${output.slice(-MAX_RENDERED_OUTPUT_LENGTH)}`
    : output;
}

export function diagnosticsFromOutput(output: string): RuntimeDiagnostic[] {
  const now = Date.now();
  return normalizeRuntimeOutput(output)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => ERROR_PATTERN.test(line) || WARNING_PATTERN.test(line))
    .slice(-100)
    .map((message) => ({
      source: "runtime" as const,
      level: ERROR_PATTERN.test(message)
        ? ("error" as const)
        : ("warning" as const),
      message,
      timestamp: now,
    }));
}
