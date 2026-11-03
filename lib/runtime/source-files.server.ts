import { createHash } from "node:crypto";
import { matchesGlob } from "node:path";
import "server-only";

import { normalizeProjectPath } from "@/lib/project-path";
import type { RuntimeFile } from "@/lib/runtime/protocol";
import { applyTextEdits, type TextEdit } from "@/lib/runtime/text-edits";
import { diffLines } from "diff";

const MAX_FILE_SIZE = 1_000_000;
const MAX_PROJECT_SIZE = 20_000_000;
const MAX_PROJECT_FILES = 500;
const MAX_READ_FILE_BYTES = 80_000;
const MAX_READ_TOTAL_BYTES = 250_000;
const MAX_LIST_RESULTS = 300;
const MAX_SEARCH_PREVIEW = 4_000;
const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  ".cache",
  ".turbo",
  "dist",
  "build",
  "bloom-generated-assets",
]);

type WorkspaceFile = {
  content: string;
  bytes: number;
};

export type FileListInput = {
  patterns: string[];
  exclude?: string[];
  limit: number;
  cursor?: string;
};

export type FileReadInput = {
  path: string;
  startLine?: number;
  endLine?: number;
};

export type CodeSearchInput = {
  query: string;
  mode: "literal" | "regex";
  globs?: string[];
  caseSensitive: boolean;
  contextLines: number;
  maxResults: number;
};

export type AtomicFileChange =
  | { type: "create"; path: string; content: string }
  | { type: "edit"; path: string; edits: TextEdit[] }
  | { type: "delete"; path: string };


function workspaceFile(content: string): WorkspaceFile {
  return {
    content,
    bytes: Buffer.byteLength(content),
  };
}

function lineCount(content: string) {
  return content.length === 0 ? 0 : content.split("\n").length;
}

function normalizeGlob(input: string) {
  const value = input
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
  if (
    !value ||
    value.startsWith("/") ||
    value === ".." ||
    value.startsWith("../") ||
    value.includes("/../") ||
    value.includes("\0")
  ) {
    throw new Error(`Invalid project glob: ${input}`);
  }
  return value;
}

function isExcluded(path: string) {
  return path.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function isSensitivePath(path: string) {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  return (
    name === ".env" ||
    (name.startsWith(".env.") && name !== ".env.example") ||
    /(?:^|\.)credentials?(?:\.|$)/i.test(name) ||
    /\.(?:pem|p12|pfx|key)$/i.test(name)
  );
}

function isRuntimeArtifactPath(path: string) {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";

  return (
    name.endsWith(".tsbuildinfo") ||
    name === ".eslintcache" ||
    name === "yarn-error.log" ||
    /^(?:npm|pnpm|yarn)-debug\.log(?:\.\d+)?$/.test(name)
  );
}

function isModelVisiblePath(path: string) {
  return (
    !isExcluded(path) && !isSensitivePath(path) && !isRuntimeArtifactPath(path)
  );
}

function matchesAny(path: string, patterns: string[]) {
  return patterns.some((pattern) => matchesGlob(path, pattern));
}

function cursorKey(input: Omit<FileListInput, "cursor">) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);
}

function encodeCursor(key: string, offset: number) {
  return Buffer.from(JSON.stringify({ key, offset }), "utf8").toString(
    "base64url",
  );
}

function decodeCursor(cursor: string, expectedKey: string) {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { key?: unknown; offset?: unknown };
    if (
      value.key !== expectedKey ||
      !Number.isInteger(value.offset) ||
      Number(value.offset) < 0
    ) {
      throw new Error("mismatch");
    }
    return Number(value.offset);
  } catch {
    throw new Error(
      "The listFiles cursor is invalid or belongs to another query",
    );
  }
}

function assertSafeRegex(source: string) {
  if (source.length > 300) {
    throw new Error("Regex queries are limited to 300 characters");
  }
  if (/\\[1-9]|\(\?<[=!]|\(\?[=!]/.test(source)) {
    throw new Error("Regex backreferences and lookarounds are not supported");
  }
  if (/\([^)]*[+*][^)]*\)[+*{]|(?:\.\*|\.\+)[+*{]/.test(source)) {
    throw new Error("Regex contains a potentially expensive nested quantifier");
  }
  if (/\([^)]*\|[^)]*\)[+*{]/.test(source)) {
    throw new Error("Regex cannot quantify an alternation group");
  }
  const quantifiers =
    source.match(/(?:[*+]\??|\{\d+(?:,\d*)?\}\??)/g)?.length ?? 0;
  if (quantifiers > 20) throw new Error("Regex contains too many quantifiers");
}

function routeFromFile(filePath: string) {
  const match = filePath.match(
    /^(?:src\/)?app\/(.*)\/(?:page|route)\.[cm]?[jt]sx?$/,
  );
  const rootMatch = filePath.match(
    /^(?:src\/)?app\/(?:page|route)\.[cm]?[jt]sx?$/,
  );
  if (!match && !rootMatch) return null;
  const segments = (match?.[1] ?? "")
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^\(.*\)$/.test(segment) && !segment.startsWith("@"));
  return `/${segments.join("/")}`;
}

function validateSnapshot(files: Map<string, WorkspaceFile>) {
  if (files.size === 0 || files.size > MAX_PROJECT_FILES) {
    throw new Error("Project has an invalid number of source files");
  }
  let total = 0;
  for (const [path, file] of files) {
    normalizeProjectPath(path);
    if (file.bytes > MAX_FILE_SIZE) {
      throw new Error(`${path} exceeds the 1 MB source-file limit`);
    }
    total += file.bytes;
  }
  if (total > MAX_PROJECT_SIZE) {
    throw new Error("Project exceeds the 20 MB source limit");
  }
}

function changedPathsBetween(
  before: Map<string, WorkspaceFile>,
  after: Map<string, WorkspaceFile>,
) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths]
    .filter((path) => before.get(path)?.content !== after.get(path)?.content)
    .sort();
}

function cappedRecord(record: Record<string, string>, limit: number) {
  return Object.fromEntries(
    Object.entries(record)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, limit),
  );
}

export class SourceFiles {
  #files: Map<string, WorkspaceFile>;

  constructor(files: RuntimeFile[]) {
    this.#files = new Map(
      files.map((file) => [
        normalizeProjectPath(file.path),
        workspaceFile(file.content),
      ]),
    );
    validateSnapshot(this.#files);
  }

  inspectStructured(changedPaths: string[] = []) {
    let scripts: Record<string, string> = {};
    let dependencies: Record<string, string> = {};
    let devDependencies: Record<string, string> = {};

    try {
      const parsed = JSON.parse(
        this.#files.get("package.json")?.content || "{}",
      ) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      scripts = parsed.scripts ?? {};
      dependencies = parsed.dependencies ?? {};
      devDependencies = parsed.devDependencies ?? {};
    } catch {
      // The agent can inspect and repair an invalid manifest.
    }

    const paths = [...this.#files.keys()].filter(isModelVisiblePath).sort();

    const keyPatterns = [
      /^(?:src\/)?app\/layout\.[jt]sx$/,
      /^(?:src\/)?app\/page\.[jt]sx$/,
      /^(?:src\/)?app\/globals\.css$/,
      /^next\.config\.[cm]?[jt]s$/,
      /^tsconfig\.json$/,
      /^package\.json$/,
      /^pnpm-workspace\.yaml$/,
      /^prisma\/schema\.prisma$/,
      /^drizzle\.config\./,
      /^middleware\.[jt]s$/,
      /^proxy\.[jt]s$/,
      /^tailwind\.config\./,
      /^components\.json$/,
      /^(?:vitest|jest|playwright)\.config\./,
    ];
    const allKeyFiles = paths.filter((path) =>
      keyPatterns.some((pattern) => pattern.test(path)),
    );
    const allRoutes = [
      ...new Set(paths.map(routeFromFile).filter(Boolean)),
    ].sort() as string[];
    const allChangedPaths = changedPaths;
    const truncated =
      Object.keys(scripts).length > 100 ||
      Object.keys(dependencies).length > 300 ||
      Object.keys(devDependencies).length > 300 ||
      allKeyFiles.length > 100 ||
      allRoutes.length > 200 ||
      allChangedPaths.length > 500;
    scripts = cappedRecord(scripts, 100);
    dependencies = cappedRecord(dependencies, 300);
    devDependencies = cappedRecord(devDependencies, 300);

    return {
      scripts,
      dependencies,
      devDependencies,
      routes: allRoutes.slice(0, 200),
      keyFiles: allKeyFiles.slice(0, 100),
      changedPaths: allChangedPaths.slice(0, 500),
      truncated,
    };
  }

  list(input: FileListInput) {
    const patterns = input.patterns.map(normalizeGlob);
    const exclude = (input.exclude ?? []).map(normalizeGlob);
    const limit = Math.min(input.limit, MAX_LIST_RESULTS);
    const query = { patterns, exclude, limit };
    const key = cursorKey(query);
    const offset = input.cursor ? decodeCursor(input.cursor, key) : 0;
    const all = [...this.#files.entries()]
      .filter(([path]) => isModelVisiblePath(path))
      .filter(([path]) => matchesAny(path, patterns))
      .filter(([path]) => exclude.length === 0 || !matchesAny(path, exclude))
      .map(([path, file]) => ({ path, bytes: file.bytes }))
      .sort((a, b) => a.path.localeCompare(b.path));
    const files = all.slice(offset, offset + limit);
    const nextOffset = offset + files.length;
    const truncated = nextOffset < all.length;
    return {
      files,
      truncated,
      ...(truncated ? { nextCursor: encodeCursor(key, nextOffset) } : {}),
    };
  }

  readBounded(requests: FileReadInput[]) {
    let remainingBytes = MAX_READ_TOTAL_BYTES;
    return {
      files: requests.map((request) => {
        const path = normalizeProjectPath(request.path);
        if (!isModelVisiblePath(path)) {
          return {
            status: "error" as const,
            path,
            error: "This path is unavailable to the coding agent",
          };
        }
        const file = this.#files.get(path);
        if (!file)
          return { status: "error" as const, path, error: "File not found" };

        const lines = file.content.length === 0 ? [] : file.content.split("\n");
        const startLine = request.startLine ?? 1;

        if (lines.length === 0) {
          if (startLine !== 1) {
            return {
              status: "error" as const,
              path,
              error: `startLine exceeds the file's 0 lines`,
            };
          }

          return {
            status: "ok" as const,
            path,
            content: "",
            startLine: 1,
            endLine: 1,
            totalLines: 0,
            truncated: false,
          };
        }

        const requestedEnd = request.endLine ?? lines.length;
        if (requestedEnd < startLine) {
          return {
            status: "error" as const,
            path,
            error: "endLine must be greater than or equal to startLine",
          };
        }
        if (startLine > Math.max(lines.length, 1)) {
          return {
            status: "error" as const,
            path,
            error: `startLine exceeds the file's ${lines.length} lines`,
          };
        }

        const endLimit = Math.min(requestedEnd, lines.length);
        const selected: string[] = [];
        let usedBytes = 0;
        let endLine = startLine - 1;
        const byteLimit = Math.min(MAX_READ_FILE_BYTES, remainingBytes);
        for (let line = startLine; line <= endLimit; line++) {
          const value = lines[line - 1];
          const bytes =
            Buffer.byteLength(value) + (selected.length > 0 ? 1 : 0);
          if (usedBytes + bytes > byteLimit) break;
          selected.push(value);
          usedBytes += bytes;
          endLine = line;
        }
        if (selected.length === 0 && startLine <= endLimit) {
          return {
            status: "error" as const,
            path,
            error:
              "The requested line exceeds the remaining read response budget",
          };
        }
        remainingBytes -= usedBytes;
        const truncated = endLine < endLimit;
        return {
          status: "ok" as const,
          path,
          content: selected.join("\n"),
          startLine,
          endLine: Math.max(endLine, startLine),
          totalLines: lines.length,
          truncated,
          ...(truncated ? { nextStartLine: endLine + 1 } : {}),
        };
      }),
    };
  }

  search(input: CodeSearchInput) {
    const globs = input.globs?.map(normalizeGlob);
    let expression: RegExp | null = null;
    if (input.mode === "regex") {
      assertSafeRegex(input.query);
      try {
        expression = new RegExp(input.query, input.caseSensitive ? "" : "i");
      } catch (error) {
        throw new Error(
          `Invalid regular expression: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
    const needle = input.caseSensitive
      ? input.query
      : input.query.toLowerCase();
    const matches: Array<{
      path: string;
      line: number;
      column: number;
      preview: string;
    }> = [];
    let searchedFiles = 0;
    let searchWasTruncated = false;

    for (const [path, file] of [...this.#files.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!isModelVisiblePath(path) || (globs && !matchesAny(path, globs)))
        continue;
      searchedFiles++;
      const lines = file.content.split("\n");
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (expression && line.length > 20_000) {
          searchWasTruncated = true;
          continue;
        }
        const regexMatch = expression?.exec(line);
        const literalIndex = input.caseSensitive
          ? line.indexOf(needle)
          : line.toLowerCase().indexOf(needle);
        const column = regexMatch ? regexMatch.index : literalIndex;
        if (column < 0) continue;
        const previewStart = Math.max(0, index - input.contextLines);
        const previewEnd = Math.min(
          lines.length,
          index + input.contextLines + 1,
        );
        matches.push({
          path,
          line: index + 1,
          column: column + 1,
          preview: lines
            .slice(previewStart, previewEnd)
            .join("\n")
            .slice(0, MAX_SEARCH_PREVIEW),
        });
        if (matches.length >= input.maxResults) {
          return { matches, searchedFiles, truncated: true };
        }
      }
    }
    return { matches, searchedFiles, truncated: searchWasTruncated };
  }

  applyAtomic(changes: AtomicFileChange[]) {
    const before = this.#files;
    const next = new Map(before);
    const occupied = new Set<string>();
    const normalized = changes.map((change) => {
      const source = normalizeProjectPath(change.path);
      if (!isModelVisiblePath(source)) {
        throw new Error(`${source} is unavailable to the coding agent`);
      }
      if (occupied.has(source)) {
        throw new Error(
          `${source} appears more than once in this mutation batch`,
        );
      }
      occupied.add(source);
      return { ...change, path: source };
    });

    const patched = new Map<
      string,
      {
        content: string;
        addedLines: number;
        deletedLines: number;
      }
    >();

    for (const change of normalized) {
      const path = change.path;
      const existing = before.get(path);
      if (change.type === "create") {
        continue;
      }
      if (!existing) throw new Error(`${path} does not exist`);
      if (change.type === "edit") {
        const content = applyTextEdits(path, existing.content, change.edits);
        patched.set(path, {
          content,
          ...lineChanges(existing.content, content),
        });
      }
    }

    const summaries: Array<{
      path: string;
      operation: "created" | "edited" | "deleted";
      addedLines: number;
      deletedLines: number;
    }> = [];
    for (const change of normalized) {
      if (change.type === "create") {
        const existing = before.get(change.path)!;
        const file = workspaceFile(change.content);
        next.set(change.path, file);
        summaries.push({
          path: change.path,
          operation: "created",
          addedLines: lineCount(change.content),
          deletedLines: existing ? lineCount(existing.content) : 0,
        });
      } else if (change.type === "edit") {
        const result = patched.get(change.path)!;

        next.set(
          change.path,
          workspaceFile(result.content),
        );

        summaries.push({
          path: change.path,
          operation: "edited",
          addedLines: result.addedLines,
          deletedLines: result.deletedLines,
        });
      } else {
        const existing = before.get(change.path)!;
        next.delete(change.path);
        summaries.push({
          path: change.path,
          operation: "deleted",
          addedLines: 0,
          deletedLines: lineCount(existing.content),
        });
      }
    }
    validateSnapshot(next);
    this.#files = next;
    return {
      files: summaries,
      changedPaths: changedPathsBetween(before, next),
    };
  }

  toSourceFiles() {
    return [...this.#files.entries()]
      .map(([path, file]) => ({ path, content: file.content }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}

function lineChanges(before: string, after: string) {
  let addedLines = 0;
  let deletedLines = 0;

  for (const change of diffLines(before, after)) {
    if (change.added) {
      addedLines += change.count ?? 0;
    } else if (change.removed) {
      deletedLines += change.count ?? 0;
    }
  }

  return { addedLines, deletedLines };
}

export function changedSourcePaths(before: RuntimeFile[], after: RuntimeFile[]) {
  return changedPathsBetween(
    new Map(before.map((file) => [file.path, workspaceFile(file.content)])),
    new Map(after.map((file) => [file.path, workspaceFile(file.content)])),
  );
}
