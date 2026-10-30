import "server-only";

import { normalizeProjectPath } from "@/lib/project-path";
import { getProjectRevisionFiles } from "@/lib/project-source.server";
import { commitProjectRevision } from "@/lib/project-source.server";
import { container } from "@/lib/runtime/local-container-runtime.server";
import type {
  RuntimeCommandInput,
  RuntimeFile,
  RuntimeState,
} from "@/lib/runtime/protocol";
import { RUNTIME_EXECUTABLES } from "@/lib/runtime/protocol";
import { assertForegroundCommand } from "@/lib/runtime/command-policy";
import {
  SourceFiles,
  changedSourcePaths,
  type AtomicFileChange,
  type CodeSearchInput,
  type FileListInput,
  type FileReadInput,
} from "@/lib/runtime/source-files.server";
import {
  skippedTypeScriptValidation,
  summarizeTypeScriptValidation,
  unavailableTypeScriptValidation,
} from "@/lib/runtime/typecheck-diagnostics";
import { generatedProjectRuntimeFiles } from "@/lib/generated-assets.server";

type RevisionInput = { revisionId: string | null; files: RuntimeFile[] };

async function currentRevision(projectId: string): Promise<RevisionInput> {
  const source = await getProjectRevisionFiles(projectId);
  return {
    revisionId: source.revisionId,
    files: source.files.map(({ path, content }) => ({ path, content })),
  };
}

async function currentSourceFiles(projectId: string, signal?: AbortSignal) {
  return new SourceFiles(await container.snapshot(projectId, signal));
}

export async function prepareProjectRuntime(
  projectId: string,
  input?: RevisionInput,
  signal?: AbortSignal,
) {
  const source = input ?? (await currentRevision(projectId));
  const assets = await generatedProjectRuntimeFiles(projectId);
  return container.ensure({ projectId, ...source, assets }, signal);
}

export async function captureProjectSourceSnapshot(
  projectId: string,
  signal?: AbortSignal,
) {
  return (await currentSourceFiles(projectId, signal)).toSourceFiles();
}

export async function listProjectFiles(
  projectId: string,
  input: FileListInput,
  signal?: AbortSignal,
) {
  return (await currentSourceFiles(projectId, signal)).list(input);
}

export async function readProjectFiles(
  projectId: string,
  input: FileReadInput[],
  signal?: AbortSignal,
) {
  return (await currentSourceFiles(projectId, signal)).readBounded(input);
}

export async function searchProjectFiles(
  projectId: string,
  input: CodeSearchInput,
  signal?: AbortSignal,
) {
  return (await currentSourceFiles(projectId, signal)).search(input);
}

export async function exploreProjectFiles(
  projectId: string,
  signal?: AbortSignal,
) {
  const [base, files] = await Promise.all([
    currentRevision(projectId),
    container.snapshot(projectId, signal),
  ]);
  return new SourceFiles(files).inspectStructured(
    base.revisionId ? changedSourcePaths(base.files, files) : [],
  );
}

/**
 * Build a `next typegen` command. Running `next typegen` first generates
 * Next.js route type definitions and next-env.d.ts, so a subsequent
 * `tsc --noEmit` (run separately by the caller) validates route usage —
 * e.g. `@/app/page` imports and generated Link href types — without the
 * false "Cannot find module" errors that arise when route types are
 * missing.
 *
 * We intentionally do NOT scope tsc to changed files: tsc respects
 * tsconfig.json (paths, project references, include/exclude) only when run
 * over the whole project. Scoping it to individual files produces false
 * errors for modules resolved through tsconfig paths.
 *
 * Returns null when no type-checkable file changed (e.g. CSS-only or
 * JSON-only changes), signalling the caller to skip both typegen and tsc.
 */
function typegenCommand(changedPaths: string[]) {
  const typecheckablePaths = changedPaths.filter((path) =>
    /\.(?:[cm]?[jt]sx?)$/i.test(path),
  );

  if (typecheckablePaths.length === 0) return null;

  return {
    executable: "pnpm" as const,
    args: ["exec", "next", "typegen"],
    cwd: ".",
    timeoutMs: 90_000,
  };
}

const typeCheckCommand = {
  executable: "pnpm" as const,
  args: ["exec", "tsc", "--noEmit"],
  cwd: ".",
  timeoutMs: 180_000,
};

async function runTypeCheck(
  projectId: string,
  changedPaths: string[],
  signal: AbortSignal,
) {
  const typegen = typegenCommand(changedPaths);
  if (!typegen) return skippedTypeScriptValidation();

  try {
    const typegenResult = await container.runCommand(
      projectId,
      typegen,
      signal,
    );
    if (typegenResult.exitCode !== 0) {
      return summarizeTypeScriptValidation(typegenResult);
    }
    return summarizeTypeScriptValidation(
      await container.runCommand(
        projectId,
        typeCheckCommand,
        signal,
      ),
    );
  } catch (error) {
    return unavailableTypeScriptValidation(error);
  }
}

export async function applyProjectChanges(
  projectId: string,
  changes: AtomicFileChange[],
  options?: {
    signal?: AbortSignal;
    typecheck?: boolean;
  },
) {
  const files = await currentSourceFiles(projectId, options?.signal);
  const before = files.toSourceFiles();
  const result = files.applyAtomic(changes);
  const revision = await currentRevision(projectId);
  const assets = await generatedProjectRuntimeFiles(projectId);
  const operationSignal = AbortSignal.timeout(300_000);

  try {
    await container.replaceSource(
      projectId,
      revision.revisionId,
      files.toSourceFiles(),
      assets,
      operationSignal,
    );

    let diagnostic;
    try {
      diagnostic = options?.typecheck === false
        ? skippedTypeScriptValidation()
        : await runTypeCheck(
          projectId,
          result.changedPaths,
          operationSignal,
        );
    } catch (error) {
      diagnostic = unavailableTypeScriptValidation(error);
    }
    const beforeByPath = new Map(before.map((file) => [file.path, file.content]));
    const afterByPath = new Map(files.toSourceFiles().map((file) => [file.path, file.content]));
    const contents = result.changedPaths.map((path) => ({
      path,
      before: beforeByPath.get(path) ?? null,
      after: afterByPath.get(path) ?? null,
    }));
    return { ...result, ...diagnostic, contents };
  } catch (error) {
    await container.replaceSource(
      projectId,
      revision.revisionId,
      before,
      assets,
      AbortSignal.timeout(120_000),
    ).catch(() => undefined);
    throw error;
  }
}

/** Full-project TypeScript validation, as run after file changes. */
export async function validateProjectTypes(projectId: string, signal?: AbortSignal) {
  try {
    return await runTypeCheck(
      projectId,
      ["app/page.tsx"],
      signal ?? AbortSignal.timeout(300_000),
    );
  } catch (error) {
    return unavailableTypeScriptValidation(error);
  }
}

export async function checkpointProjectRuntime(
  projectId: string,
  authorType: "AGENT" | "USER" = "AGENT",
  options?: { typecheck?: boolean },
) {
  const revision = await currentRevision(projectId);
  const operationSignal = AbortSignal.timeout(300_000);
  const files = await captureProjectSourceSnapshot(projectId, operationSignal);
  const changedPaths = changedSourcePaths(revision.files, files);
  if (changedPaths.length === 0) {
    return {
      revisionId: revision.revisionId,
      changedPaths,
      validation: null,
    };
  }

  try {
    const committed = await commitProjectRevision({
      projectId,
      expectedRevisionId: revision.revisionId,
      files,
      authorType,
    });

    let diagnostic;
    try {
      diagnostic = options?.typecheck === false
        ? skippedTypeScriptValidation()
        : await runTypeCheck(
          projectId,
          changedPaths,
          operationSignal,
        );
    } catch (error) {
      diagnostic = unavailableTypeScriptValidation(error);
    }
    return { revisionId: committed.id, changedPaths, ...diagnostic };
  } catch (error) {
    const assets = await generatedProjectRuntimeFiles(projectId);
    await container.replaceSource(
      projectId,
      revision.revisionId,
      revision.files,
      assets,
      AbortSignal.timeout(120_000),
    ).catch(() => undefined);
    throw error;
  }
}

export async function materializeGeneratedProjectAssets(
  projectId: string,
  signal?: AbortSignal,
) {
  const [files, revision, assets] = await Promise.all([
    captureProjectSourceSnapshot(projectId, signal),
    currentRevision(projectId),
    generatedProjectRuntimeFiles(projectId),
  ]);
  await container.replaceSource(
    projectId,
    revision.revisionId,
    files,
    assets,
    signal,
  );
}

export async function runProjectCommand(
  projectId: string,
  command: RuntimeCommandInput,
  signal?: AbortSignal,
) {
  if (!RUNTIME_EXECUTABLES.includes(command.executable)) {
    throw new Error(`Runtime executable is not allowed: ${command.executable}`);
  }
  if (command.cwd !== ".") normalizeProjectPath(command.cwd);
  if (!command.args.every((arg) => !arg.includes("\0"))) {
    throw new Error("Command arguments cannot contain null bytes");
  }

  assertForegroundCommand(command.executable, command.args);

  return container.runCommand(projectId, command, signal);
}

export function getProjectRuntimeState(
  projectId: string,
  signal?: AbortSignal,
): Promise<RuntimeState> {
  return container.getState(projectId, signal);
}

export async function ensureProjectPreview(
  projectId: string,
  signal?: AbortSignal,
): Promise<RuntimeState> {
  const state = await container.getState(projectId, signal);
  const hasRuntimeErrors = state.diagnostics.some(
    (diagnostic) => diagnostic.level === "error",
  );

  if (state.status === "ready" && state.previewUrl && !hasRuntimeErrors) {
    return state;
  }

  return container.restartPreview(projectId, signal);
}
