import "server-only";

import { createHash } from "node:crypto";
import { PREVIEW_INSPECTOR_CONTENT, PREVIEW_INSPECTOR_MARKER, PREVIEW_INSPECTOR_PATH } from "@/lib/runtime/preview-inspector";
import type { RuntimeWorkspace } from "@/lib/runtime/protocol";
import type { CodeSearchInput } from "@/lib/runtime/source-files.server";
import {
  MAX_SOURCE_BYTES,
  MAX_SOURCE_FILE_BYTES,
  MAX_SOURCE_FILES,
  SOURCE_EXCLUDED_SEGMENTS,
} from "@/lib/runtime/source-limits";

export const DEPENDENCY_MANIFESTS = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
];

export const COMMAND_OUTPUT_LIMIT = 100_000;
export const SNAPSHOT_OUTPUT_LIMIT = 32_000_000;

const INSPECTOR_DIGEST = createHash("sha256")
  .update(PREVIEW_INSPECTOR_CONTENT, "utf8")
  .digest("hex");

export const PROJECT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0a0a0a"/>
  <g stroke="#ffffff" stroke-width="3.2" stroke-linecap="round">
    <line x1="16" y1="6" x2="16" y2="26"/>
    <line x1="7.3" y1="11" x2="24.7" y2="21"/>
    <line x1="24.7" y1="11" x2="7.3" y2="21"/>
  </g>
</svg>
`;


export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputTruncated: boolean;
};

export type SyncMode = "reset" | "replace" | "overlay";
export type SnapshotMode = "full" | "digest" | "capture" | "metadata" | "search";
export type SnapshotFilter = { paths?: string[]; globs?: string[]; search?: CodeSearchInput };

export function workspacePayload(files: RuntimeWorkspace["files"], deletedPaths: string[]) {
  return JSON.stringify(
    files.map((file) => ({
      path: file.path,
      content:
        file.encoding === "base64"
          ? file.content
          : Buffer.from(file.content, "utf8").toString("base64"),
    })).concat(deletedPaths.map((path) => ({ path, content: "", remove: true }))),
  );
}

export function parseWorkspaceSnapshot(output: string, mode?: SnapshotMode) {
  let files: Array<{ path: string; content: string; size: number; binary: boolean }>;
  try {
    files = JSON.parse(output) as Array<{ path: string; content: string; size: number; binary: boolean }>;
  } catch {
    throw new Error("Project source snapshot was invalid");
  }

  if (!Array.isArray(files)) {
    throw new Error("Project source snapshot was invalid");
  }

  return files.flatMap<RuntimeWorkspace["files"][number]>((file) => {
    if (
      !file ||
      typeof file.path !== "string" ||
      typeof file.content !== "string"
    ) {
      throw new Error("Project source snapshot was invalid");
    }

    if (mode === "metadata") {
      return file.path === PREVIEW_INSPECTOR_PATH ? [] : [{ path: file.path, content: "", size: file.size }];
    }
    if (mode === "digest") {
      return file.path === PREVIEW_INSPECTOR_PATH &&
        file.content === INSPECTOR_DIGEST
        ? []
        : [{ path: file.path, content: file.content }];
    }

    if (file.binary) return [{ path: file.path, content: file.content, encoding: "base64" as const }];
    const content = Buffer.from(file.content, "base64").toString("utf8");
    return file.path === PREVIEW_INSPECTOR_PATH &&
      content.startsWith(PREVIEW_INSPECTOR_MARKER)
      ? []
      : [{ path: file.path, content }];
  });
}

export function changedFiles(
  before: RuntimeWorkspace["files"],
  after: RuntimeWorkspace["files"],
) {
  const previous = new Map(before.map((file) => [file.path, file.content]));
  const current = new Map(after.map((file) => [file.path, file.content]));
  const paths = new Set([...previous.keys(), ...current.keys()]);

  return [...paths]
    .sort((a, b) => a.localeCompare(b))
    .flatMap((path) => {
      const oldContent = previous.get(path);
      const newContent = current.get(path);
      if (oldContent === newContent) return [];
      return [
        {
          path,
          type:
            oldContent === undefined
              ? ("create" as const)
              : newContent === undefined
                ? ("delete" as const)
                : ("write" as const),
        },
      ];
    });
}

export function snapshotArgs(root: string, mode: SnapshotMode, filter: SnapshotFilter) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    root,
    encode(SOURCE_EXCLUDED_SEGMENTS),
    String(MAX_SOURCE_FILE_BYTES),
    String(MAX_SOURCE_FILES),
    String(MAX_SOURCE_BYTES),
    mode,
    encode(filter),
  ];
}
