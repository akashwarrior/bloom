import "server-only";

import prisma from "@/lib/prisma";
import { normalizeProjectPath } from "@/lib/projects/path";
import {
  commitProjectRevision,
  getProjectBaselineRevisionId,
  getProjectRevisionFileHashes,
  getProjectRevisionFiles,
} from "@/lib/projects/source.server";
import { workspaceOwner } from "@/lib/runtime/workspace-owner.server";
import { container as localContainer } from "@/lib/runtime/local-container-runtime.server";
import { vercelSandboxRuntime } from "@/lib/runtime/vercel-sandbox-runtime.server";
import { usesVercelSandbox } from "@/lib/runtime/provider";
import type {
  RuntimeCommandInput,
  RuntimeFile,
  RuntimeState,
} from "@/lib/runtime/protocol";
import { RUNTIME_EXECUTABLES } from "@/lib/runtime/protocol";
import { assertForegroundCommand } from "@/lib/runtime/command-policy";
import {
  SourceFiles,
  normalizeGlob,
  assertSafeRegex,
  isModelVisiblePath,
  changedSourcePathsByHash,
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
import { generatedProjectRuntimeFiles } from "@/ai/generated-assets.server";

const runtime = usesVercelSandbox ? vercelSandboxRuntime : localContainer;

const local = globalThis as typeof globalThis & {
  bloomPreparedWorkspace?: { projectId: string; revisionId: string | null };
};

export async function markRuntimeRevision(projectId: string, revisionId: string | null) {
  if (usesVercelSandbox) {
    await vercelSandboxRuntime.markRevision(projectId, revisionId).catch(console.error);
    return;
  }
  local.bloomPreparedWorkspace = { projectId, revisionId };
}

export async function removeProjectRuntime(projectId: string) {
  if (usesVercelSandbox) await vercelSandboxRuntime.remove(projectId);
}

export function clearRuntimeRevision(projectId: string) {
  if (local.bloomPreparedWorkspace?.projectId === projectId) {
    delete local.bloomPreparedWorkspace;
  }
}

type RevisionInput = { revisionId: string | null; files?: RuntimeFile[] };

export async function prepareProjectRuntime(
  projectId: string,
  input?: RevisionInput,
  signal?: AbortSignal,
) {
  const revision = input ?? {
    revisionId: (await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { currentRevisionId: true },
    })).currentRevisionId,
  };
  const prepared = local.bloomPreparedWorkspace;
  if (!usesVercelSandbox && prepared?.projectId === projectId && prepared.revisionId === revision.revisionId) {
    const existing = await runtime.getState(projectId, signal, false);
    if (existing.status === "ready") return { ...existing, revisionId: prepared.revisionId };
  }

  delete local.bloomPreparedWorkspace;
  const [files, assets] = await Promise.all([
    input?.files ?? (revision.revisionId
      ? getProjectRevisionFiles(projectId, revision.revisionId).then((source) => source.files)
      : []),
    generatedProjectRuntimeFiles(projectId),
  ]);
  const state = await runtime.ensure({ projectId, revisionId: revision.revisionId, files, assets }, signal);
  if (!usesVercelSandbox) await markRuntimeRevision(projectId, revision.revisionId);
  return state;
}

export function reloadCommittedRuntime(projectId: string, workspaceSignal?: AbortSignal) {
  clearRuntimeRevision(projectId);
  const timeout = AbortSignal.timeout(120_000);
  return prepareProjectRuntime(projectId, undefined, workspaceSignal ? AbortSignal.any([timeout, workspaceSignal]) : timeout);
}

export async function captureProjectSourceSnapshot(
  projectId: string,
  signal?: AbortSignal,
) {
  return runtime.snapshot(projectId, signal, "capture");
}

/**
 * Saves the scaffold as the first restorable version. Later runs compare
 * against it to avoid creating duplicate versions of an unchanged scaffold.
 */
export async function ensureProjectBaseline(
  projectId: string,
  signal?: AbortSignal,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { currentRevisionId: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.currentRevisionId) return project.currentRevisionId;

  const existingBaselineId = await getProjectBaselineRevisionId(projectId);
  if (existingBaselineId) {
    const updated = await prisma.project.updateMany({
      where: { id: projectId, currentRevisionId: null },
      data: {
        currentRevisionId: existingBaselineId,
        updatedAt: new Date(),
      },
    });
    if (updated.count === 1) return existingBaselineId;

    const current = await prisma.project.findUnique({
      where: { id: projectId },
      select: { currentRevisionId: true },
    });
    if (current?.currentRevisionId) return current.currentRevisionId;
    throw new Error("Project changed while its baseline was being prepared");
  }

  await prepareProjectRuntime(
    projectId,
    { revisionId: null, files: [] },
    signal,
  );
  const files = await captureProjectSourceSnapshot(projectId, signal);

  try {
    const revision = await commitProjectRevision({
      projectId,
      expectedRevisionId: null,
      files,
      authorType: "SYSTEM",
      summary: "Initial scaffold",
    });
    await markRuntimeRevision(projectId, revision.id);
    return revision.id;
  } catch (error) {
    // Another request may have created the baseline first. Its revision is the
    // same scaffold, so continue from it instead of failing this request.
    const current = await prisma.project.findUnique({
      where: { id: projectId },
      select: { currentRevisionId: true },
    });
    if (current?.currentRevisionId) return current.currentRevisionId;
    throw error;
  }
}

export async function listProjectFiles(
  projectId: string,
  input: FileListInput,
  signal?: AbortSignal,
) {
  const files = await runtime.snapshot(projectId, signal, "metadata", {
    globs: input.patterns.map(normalizeGlob),
  });
  return new SourceFiles(files, { metadataOnly: true }).list(input);
}

export async function readProjectFiles(
  projectId: string,
  input: FileReadInput[],
  signal?: AbortSignal,
) {
  const paths = input.flatMap(({ path }) => {
    try {
      return [normalizeProjectPath(path)];
    } catch {
      return [];
    }
  });
  const files = await runtime.snapshot(projectId, signal, "full", { paths });
  return new SourceFiles(files).readBounded(input);
}

export async function searchProjectFiles(
  projectId: string,
  input: CodeSearchInput,
  signal?: AbortSignal,
) {
  if (input.mode === "regex") {
    assertSafeRegex(input.query);
    new RegExp(input.query, input.caseSensitive ? "" : "i");
  }
  const files = await runtime.snapshot(projectId, signal, "metadata", {
    globs: input.globs?.map(normalizeGlob),
  });
  const paths = files.map(({ path }) => path).filter(isModelVisiblePath);
  return runtime.search(projectId, paths, input, signal);
}

function changedDigests(
  hashes: { path: string; sha256: string }[],
  files: RuntimeFile[],
) {
  const current = new Map(files.map(({ path, content }) => [path, content]));
  const previous = new Map(hashes.map(({ path, sha256 }) => [path, sha256]));
  return [...new Set([...current.keys(), ...previous.keys()])]
    .filter((path) => current.get(path) !== previous.get(path)).sort();
}

export async function changedWorkspacePaths(projectId: string, revisionId: string, signal?: AbortSignal) {
  const [base, files] = await Promise.all([
    getProjectRevisionFileHashes(projectId, revisionId),
    runtime.snapshot(projectId, signal, "digest"),
  ]);
  return changedDigests(base.files, files);
}

export async function exploreProjectFiles(projectId: string, signal?: AbortSignal) {
  const [base, files, contents] = await Promise.all([
    getProjectRevisionFileHashes(projectId),
    runtime.snapshot(projectId, signal, "digest"),
    runtime.snapshot(projectId, signal, "full", { paths: ["package.json"] }),
  ]);
  const manifest = files.map(({ path }) => contents.find((file) => file.path === path) ?? { path, content: "" });
  return new SourceFiles(manifest).inspectStructured(base.revisionId ? changedDigests(base.files, files) : []);
}

/**
 * Type checks run `next typegen` first so Next.js route type definitions and
 * next-env.d.ts exist, then run `tsc --noEmit` over the whole project. Scoping
 * tsc to individual files produces false errors for modules resolved through
 * tsconfig paths.
 */
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
  const typecheckablePaths = changedPaths.filter((path) =>
    /\.(?:[cm]?[jt]sx?)$/i.test(path),
  );

  if (typecheckablePaths.length === 0) return skippedTypeScriptValidation();
  return runProjectTypeCheck(projectId, signal);
}

/** Runs typegen then a full `tsc --noEmit`, regardless of which paths changed. */
async function runProjectTypeCheck(projectId: string, signal: AbortSignal) {
  try {
    const typegenResult = await runtime.runCommand(
      projectId,
      {
        executable: "pnpm" as const,
        args: ["exec", "next", "typegen"],
        cwd: ".",
        timeoutMs: 90_000,
      },
      signal,
    );
    if (typegenResult.exitCode !== 0) {
      return summarizeTypeScriptValidation(typegenResult);
    }
    return summarizeTypeScriptValidation(
      await runtime.runCommand(
        projectId,
        typeCheckCommand,
        signal,
      ),
    );
  } catch (error) {
    return unavailableTypeScriptValidation(error);
  }
}

/** Full-project typecheck for the finish gate. */
export async function validateProjectTypes(
  projectId: string,
  signal?: AbortSignal,
) {
  return runProjectTypeCheck(projectId, signal ?? AbortSignal.timeout(300_000));
}

export async function applyProjectChanges(
  projectId: string,
  changes: AtomicFileChange[],
  options?: {
    signal?: AbortSignal;
    typecheck?: boolean;
  },
) {
  const paths = changes.map(({ path }) => normalizeProjectPath(path));
  const before = await runtime.snapshot(projectId, options?.signal, "capture", { paths });
  if (before.some((file) => file.encoding === "base64")) {
    throw new Error("Source editing requires text files");
  }
  const files = new SourceFiles(before);
  const result = files.applyAtomic(changes);
  const after = files.toSourceFiles();
  const changed = new Set(result.changedPaths);
  const beforeByPath = new Map(before.map((file) => [file.path, file.content]));
  const afterByPath = new Map(after.map((file) => [file.path, file.content]));
  const operationSignal = options?.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(300_000)])
    : AbortSignal.timeout(300_000);

  try {
    if (changed.size) {
      await runtime.patchSource(
        projectId,
        after.filter((file) => changed.has(file.path)),
        result.changedPaths.filter((path) => !afterByPath.has(path)),
        operationSignal,
      );
    }

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
    const contents = result.changedPaths.map((path) => ({
      path,
      before: beforeByPath.get(path) ?? null,
      after: afterByPath.get(path) ?? null,
    }));
    return { ...result, ...diagnostic, contents };
  } catch (error) {
    await runtime.patchSource(
      projectId,
      before.filter((file) => changed.has(file.path)),
      result.changedPaths.filter((path) => !beforeByPath.has(path)),
      AbortSignal.timeout(120_000),
    ).catch(console.error);
    throw error;
  }
}

/**
 * Records the workspace as one revision when it differs from the revision the
 * request started from. A request that changed no files returns that base
 * revision instead of creating a version.
 */
export async function checkpointProjectRuntime(
  projectId: string,
  authorType: "AGENT" | "USER" = "AGENT",
  options: { baseRevisionId: string | null; typecheck?: boolean; signal?: AbortSignal },
) {
  if (!options.baseRevisionId) {
    throw new Error("Project baseline is missing");
  }
  const revision = await getProjectRevisionFileHashes(
    projectId,
    options.baseRevisionId,
  );
  const timeout = AbortSignal.timeout(300_000);
  const operationSignal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const files = await captureProjectSourceSnapshot(projectId, operationSignal);
  const changedPaths = changedSourcePathsByHash(revision.files, files);
  if (changedPaths.length === 0) {
    return {
      revisionId: revision.revisionId,
      changedPaths,
      validation: null,
    };
  }

  operationSignal.throwIfAborted();
  const committed = await commitProjectRevision({
    projectId,
    expectedRevisionId: revision.revisionId,
    files,
    authorType,
  });

  await markRuntimeRevision(projectId, committed.id);
  let diagnostic;
  try {
    diagnostic = options.typecheck === false
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
}

export async function materializeGeneratedProjectAssets(
  projectId: string,
  assetIds: string[],
  signal?: AbortSignal,
) {
  const assets = await generatedProjectRuntimeFiles(projectId, assetIds);
  if (assets.length) await runtime.patchSource(projectId, assets, [], signal);
}

export async function restoreWorkspaceSnapshot(
  projectId: string,
  before: RuntimeFile[],
  signal: AbortSignal,
) {
  const after = await runtime.snapshot(projectId, signal, "metadata");
  const beforePaths = new Set(before.map((file) => file.path));
  await runtime.patchSource(
    projectId, before, after.filter((file) => !beforePaths.has(file.path)).map((file) => file.path), signal,
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

  return runtime.runCommand(projectId, command, signal);
}

export async function getProjectRuntimeState(
  projectId: string,
  signal?: AbortSignal,
): Promise<RuntimeState> {
  if (usesVercelSandbox) return vercelSandboxRuntime.getState(projectId, signal, false);
  const owner = workspaceOwner();
  const prepared = local.bloomPreparedWorkspace;
  if (prepared?.projectId !== projectId || (owner && owner.projectId !== projectId)) {
    return {
      status: owner ? "busy" : "idle",
      previewUrl: null, revisionId: null, logs: [], diagnostics: [], error: null,
    };
  }
  const state = await runtime.getState(projectId, signal, false);
  if (local.bloomPreparedWorkspace !== prepared ||
      (workspaceOwner() && workspaceOwner()?.projectId !== projectId)) {
    return { ...state, status: "busy", previewUrl: null, logs: [], diagnostics: [] };
  }
  return { ...state, revisionId: prepared.revisionId };
}

export async function ensureProjectPreview(
  projectId: string,
  signal?: AbortSignal,
): Promise<RuntimeState> {
  const state = await runtime.getState(projectId, signal);
  const hasRuntimeErrors = state.diagnostics.some(
    (diagnostic) => diagnostic.level === "error",
  );

  if (state.status === "ready" && state.previewUrl && !hasRuntimeErrors) {
    return state;
  }

  return runtime.restartPreview(projectId, signal);
}
