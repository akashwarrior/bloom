import path from "node:path";

const MAX_PATH_LENGTH = 500;

export function normalizeProjectPath(input: string) {
  const trimmed = input.trim().replaceAll("\\", "/");
  const normalized = path.posix.normalize(trimmed).replace(/^\.\/+/, "");

  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.length > MAX_PATH_LENGTH
  ) {
    throw new Error(`Invalid project path: ${input}`);
  }

  return normalized;
}
