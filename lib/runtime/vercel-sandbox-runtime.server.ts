import "server-only";

import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { APIError, Sandbox, type Command, type Session } from "@vercel/sandbox";
import { PREVIEW_INSPECTOR_CONTENT, PREVIEW_INSPECTOR_PATH } from "./preview-inspector";
import { CREATE_PROJECT_ARGS, PROJECT_DEPENDENCY_STEPS, PROJECT_TEMPLATE_FILES, PROJECT_TEMPLATE_REMOVED } from "./project-template";
import type { RuntimeCommandInput, RuntimeState, RuntimeWorkspace } from "./protocol";
import { diagnosticsFromOutput, normalizeRuntimeOutput } from "./runtime-diagnostics";
import type { CodeSearchInput } from "./source-files.server";
import {
  changedFiles, parseWorkspaceSnapshot, snapshotArgs, workspacePayload,
  COMMAND_OUTPUT_LIMIT, DEPENDENCY_MANIFESTS, PROJECT_ICON_SVG, SNAPSHOT_OUTPUT_LIMIT,
  type SnapshotFilter, type SnapshotMode,
} from "./workspace-files.server";
import { SCRIPTS } from "./workspace-scripts";

const port = 3000;
const sessionTimeout = 20 * 60_000;
const root = "/vercel/sandbox/bloom-workspace";
const metadataDir = "/vercel/sandbox/bloom-runtime";
const revisionFile = `${metadataDir}/revision`;
const dependencyFile = `${root}/node_modules/.bloom-manifest-hash`;
const previewPid = "/tmp/bloom-preview.pid";
const previewLog = "/tmp/bloom-preview.log";
const scaffold = "bloom-project";

function sandboxName(projectId: string) {
  return `bloom-${projectId}`;
}

async function getSandbox(projectId: string, signal?: AbortSignal) {
  try {
    return await Sandbox.get({ name: sandboxName(projectId), signal });
  } catch (error) {
    if (error instanceof APIError && error.response.status === 404) return null;
    throw error;
  }
}

async function runningSandbox(projectId: string, signal?: AbortSignal) {
  const sandbox = await getSandbox(projectId, signal);
  if (!sandbox || sandbox.status !== "running") {
    throw new Error("Project sandbox is not running. Start its preview and try again.");
  }
  return sandbox;
}

function collectOutput(limit: number) {
  let bytes = 0;
  let truncated = false;
  const chunks: Buffer[] = [];
  return {
    write(chunk: Buffer | string) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = limit - bytes;
      if (data.byteLength > remaining) truncated = true;
      if (remaining > 0) {
        const kept = data.subarray(0, remaining);
        chunks.push(kept);
        bytes += kept.byteLength;
      }
    },
    truncated: () => truncated,
    text: () => Buffer.concat(chunks).toString("utf8"),
  };
}

async function execute(
  session: Session,
  cmd: string,
  args: string[],
  {
    signal, cwd = root, timeoutMs = 60_000, stdin, outputLimit = COMMAND_OUTPUT_LIMIT,
  }: {
    signal?: AbortSignal;
    cwd?: string;
    timeoutMs?: number;
    stdin?: string;
    outputLimit?: number;
  } = {},
) {
  const stdout = collectOutput(outputLimit);
  const stderr = collectOutput(COMMAND_OUTPUT_LIMIT);
  const timeout = AbortSignal.timeout(timeoutMs);
  const executionSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let command: Command | undefined;
  let exitCode: number | null;
  try {
    const started = await session.runCommand({
      cmd, args, cwd, signal: executionSignal, timeoutMs, detached: true,
      env: { NEXT_TELEMETRY_DISABLED: "1", PNPM_CONFIG_PREFER_OFFLINE: "true" },
      stdin: stdin === undefined ? undefined : Readable.from([stdin]),
    });
    command = started;
    const readLogs = async () => {
      for await (const log of started.logs({ signal: executionSignal })) {
        (log.stream === "stdout" ? stdout : stderr).write(log.data);
      }
    };
    const [result] = await Promise.all([started.wait({ signal: executionSignal }), readLogs()]);
    exitCode = result.exitCode;
  } catch (error) {
    await command?.kill("SIGKILL", { abortSignal: AbortSignal.timeout(3_000) }).catch(() => undefined);
    signal?.throwIfAborted();
    if (!timeout.aborted) throw error;
    exitCode = null;
  }
  signal?.throwIfAborted();
  const timedOut = timeout.aborted;
  return {
    exitCode: exitCode ?? (timedOut ? 124 : 1),
    stdout: stdout.text(),
    stderr: stderr.text(),
    timedOut,
    outputTruncated: stdout.truncated() || stderr.truncated(),
  };
}

function requireSuccess(result: Awaited<ReturnType<typeof execute>>, action: string) {
  if (result.exitCode !== 0) {
    const output = normalizeRuntimeOutput(result.stderr || result.stdout).trim().slice(-2000);
    throw new Error(output ? `${action} failed: ${output}` : `${action} failed`);
  }
  return result.stdout;
}

function runNode(session: Session, script: string, args: string[], options?: Parameters<typeof execute>[3]) {
  return execute(session, "node", ["-e", script, ...args], options);
}

function runPnpm(session: Session, args: string[], cwd: string, signal?: AbortSignal) {
  return execute(session, "pnpm", ["--config.dangerouslyAllowAllBuilds=true", ...args], {
    cwd, signal, timeoutMs: 240_000,
  });
}

const initDirectories = `
  const fs = require("node:fs");
  for (const path of process.argv.slice(1)) fs.mkdirSync(path, { recursive: true });
`;

async function scaffoldProject(session: Session, signal?: AbortSignal) {
  const ready = await execute(session, "test", ["-f", `${root}/package.json`], { signal });
  if (ready.exitCode === 0) return;

  requireSuccess(await execute(session, "rm", ["-rf", `${root}/${scaffold}`], { signal }), "Resetting incomplete scaffold");
  requireSuccess(await runPnpm(session, CREATE_PROJECT_ARGS(scaffold), root, signal), "Scaffolding the sandbox");
  for (const step of PROJECT_DEPENDENCY_STEPS) {
    requireSuccess(await runPnpm(session, step, `${root}/${scaffold}`, signal), "Setting up the project's dependencies");
  }
  requireSuccess(await runNode(session, SCRIPTS.projectMover, [root, scaffold], { signal }), "Moving the scaffold into the workspace");
}

async function syncFiles(
  session: Session,
  files: RuntimeWorkspace["files"],
  mode: "replace" | "overlay",
  signal?: AbortSignal,
  deletedPaths: string[] = [],
) {
  const result = await runNode(session, SCRIPTS.workspaceSyncAndCheck, [
    root, mode, "", "", "", previewPid, dependencyFile, ...DEPENDENCY_MANIFESTS,
  ], { signal, stdin: workspacePayload(files, deletedPaths) });
  const state = JSON.parse(requireSuccess(result, "Synchronizing project files")) as {
    previewRunning: boolean;
    depsMatch: boolean;
  };
  if (!state.depsMatch) {
    requireSuccess(await runPnpm(session, ["install", "--prefer-offline"], root, signal), "Installing project dependencies");
    await recordDependencies(session, signal);
  }
  return !state.previewRunning || !state.depsMatch;
}

async function recordDependencies(session: Session, signal?: AbortSignal) {
  const marker = await runNode(session, SCRIPTS.dependencyMarker, [
    root, dependencyFile, "write", ...DEPENDENCY_MANIFESTS,
  ], { signal });
  requireSuccess(marker, "Recording sandbox dependencies");
}

const probePreview = String.raw`
  const fs = require("node:fs");
  const net = require("node:net");
  const [pidFile, port, logFile, limit, marker] = process.argv.slice(1);
  const text = (file) => { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } };
  let running = false;
  try {
    const pid = Number(text(pidFile));
    if (pid > 0) { process.kill(pid, 0); running = true; }
  } catch {}
  let logs = "";
  if (logFile) {
    let fd;
    try {
      fd = fs.openSync(logFile, "r");
      const size = fs.fstatSync(fd).size;
      const buffer = Buffer.alloc(Math.min(size, Number(limit)));
      const read = fs.readSync(fd, buffer, 0, buffer.length, size - buffer.length);
      logs = buffer.subarray(0, read).toString("utf8");
    } catch {} finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  const report = (listening) => {
    socket.destroy();
    process.stdout.write(JSON.stringify({ listening, running, logs, revisionId: text(marker).trim() || null }));
  };
  const socket = net.connect({ host: "127.0.0.1", port: Number(port), timeout: 500 });
  socket.once("connect", () => report(true));
  socket.once("error", () => report(false));
  socket.once("timeout", () => report(false));
`;

function emptyState(status: RuntimeState["status"] = "idle", error: string | null = null): RuntimeState {
  return { status, error, previewUrl: null, revisionId: null, logs: [], diagnostics: [] };
}

async function previewState(sandbox: Sandbox, includeLogs: boolean, signal?: AbortSignal): Promise<RuntimeState> {
  const report = await runNode(sandbox.currentSession(), probePreview, [
    previewPid, String(port), includeLogs ? previewLog : "", String(COMMAND_OUTPUT_LIMIT), revisionFile,
  ], { cwd: "/vercel/sandbox", signal, timeoutMs: 8_000, outputLimit: 6 * COMMAND_OUTPUT_LIMIT });
  const { listening, running, logs, revisionId } = JSON.parse(requireSuccess(report, "Checking sandbox preview")) as {
    listening: boolean;
    running: boolean;
    logs: string;
    revisionId: string | null;
  };
  const status = listening ? "ready" : running ? "starting" : "error";
  const output = normalizeRuntimeOutput(logs);
  return {
    ...emptyState(status, status === "error" ? "The preview process stopped. Restart it to continue." : null),
    previewUrl: listening ? sandbox.domain(port) : null,
    revisionId,
    logs: output ? [output] : [],
    diagnostics: diagnosticsFromOutput(output),
  };
}

async function startPreview(sandbox: Sandbox, signal?: AbortSignal) {
  const session = sandbox.currentSession();
  requireSuccess(await runNode(session, SCRIPTS.processKiller, [previewPid], { signal }), "Stopping the previous preview");
  requireSuccess(await execute(session, "rm", ["-f", ".next/dev/lock"], { signal }), "Clearing the preview lock");
  const command = ["node", `${root}/node_modules/next/dist/bin/next`, "dev", "--turbopack", "--hostname", "0.0.0.0", "--port", String(port)];
  await session.runCommand({
    cmd: "node",
    args: ["-e", SCRIPTS.processRunner, Buffer.from(JSON.stringify(command)).toString("base64url"), previewPid, previewLog],
    cwd: root,
    detached: true,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    signal,
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = await previewState(sandbox, false, signal);
    if (state.status === "ready") return state;
    await delay(750, undefined, { signal });
  }
  const state = await previewState(sandbox, true, signal);
  throw new Error(state.logs[0]?.slice(-2000) || "The sandbox preview did not start in time.");
}

async function readWorkspace(session: Session, signal?: AbortSignal, mode: SnapshotMode = "full", filter: SnapshotFilter = {}) {
  const filename = `/tmp/bloom-source-${randomUUID()}.json`;
  try {
    const result = await execute(session, "sh", [
      "-c", 'output="$1"; shift; exec node "$@" > "$output"', "bloom-source", filename,
      "-e", SCRIPTS.sourceSnapshotReader, ...snapshotArgs(root, mode, filter),
    ], { signal });
    requireSuccess(result, "Reading sandbox source");
    const stream = await session.readFile({ path: filename }, { signal });
    if (!stream) throw new Error("Sandbox source snapshot was not written");
    const output = collectOutput(SNAPSHOT_OUTPUT_LIMIT);
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      output.write(chunk);
      if (output.truncated()) throw new Error("Sandbox source exceeded the transfer limit");
    }
    return output.text();
  } finally {
    await execute(session, "rm", ["-f", filename], { timeoutMs: 5_000 }).catch(() => undefined);
  }
}

async function writeRevision(session: Session, revisionId: string | null, signal?: AbortSignal) {
  await session.writeFiles([{ path: revisionFile, content: Buffer.from(revisionId ?? "") }], { signal });
}

async function runWorkspaceCommand(session: Session, input: RuntimeCommandInput, signal?: AbortSignal) {
  const executable = input.executable;
  const args = input.executable === "pnpm"
    ? ["--config.dangerouslyAllowAllBuilds=true", ...input.args]
    : input.args;
  const spec = Buffer.from(JSON.stringify([executable, ...args])).toString("base64url");
  const pidFile = `/tmp/bloom-command-${randomUUID()}.pid`;
  let finished = false;
  try {
    const result = await runNode(session, SCRIPTS.processRunner, [spec, pidFile], {
      cwd: input.cwd === "." ? root : `${root}/${input.cwd}`,
      signal,
      timeoutMs: input.timeoutMs,
    });
    finished = !result.timedOut;
    return result;
  } finally {
    if (!finished) {
      await runNode(session, SCRIPTS.processKiller, [pidFile, "1000"], { timeoutMs: 5_000 }).catch(() => undefined);
    }
  }
}

export const vercelSandboxRuntime = {
  async ensure(workspace: RuntimeWorkspace, signal?: AbortSignal) {
    const sandbox = await Sandbox.getOrCreate({
      name: sandboxName(workspace.projectId),
      image: "vcr.vercel.com/vercel/sandbox/node:24",
      resources: { vcpus: 2 },
      ports: [port],
      timeout: sessionTimeout,
      persistent: true,
      keepLastSnapshots: { count: 1 },
      resume: true,
      signal,
    });
    const session = sandbox.currentSession();
    const startedAt = session.startedAt?.getTime();
    if (startedAt && startedAt + session.timeout - Date.now() < 6 * 60_000) {
      await session.extendTimeout(6 * 60_000, { signal });
    }
    requireSuccess(await runNode(session, initDirectories, [root, metadataDir], {
      cwd: "/vercel/sandbox", signal,
    }), "Creating sandbox workspace");

    const needsScaffold = workspace.revisionId === null && workspace.files.length === 0;
    if (needsScaffold) await scaffoldProject(session, signal);
    const defaultFiles = [
      ...(needsScaffold ? [{ path: "app/icon.svg", content: PROJECT_ICON_SVG }, ...PROJECT_TEMPLATE_FILES] : []),
      { path: PREVIEW_INSPECTOR_PATH, content: PREVIEW_INSPECTOR_CONTENT },
    ].filter((file) => !workspace.files.some(({ path }) => path === file.path));
    const restart = await syncFiles(session, [...workspace.files, ...(workspace.assets ?? []), ...defaultFiles],
      needsScaffold ? "overlay" : "replace", signal, needsScaffold ? PROJECT_TEMPLATE_REMOVED : []);
    await writeRevision(session, workspace.revisionId, signal);
    const state = restart ? await startPreview(sandbox, signal) : await previewState(sandbox, true, signal);
    return state.status === "ready" ? state : startPreview(sandbox, signal);
  },

  async getState(projectId: string, signal?: AbortSignal, includeLogs = true): Promise<RuntimeState> {
    const sandbox = await getSandbox(projectId, signal);
    if (!sandbox) return emptyState();
    if (sandbox.status === "pending") return emptyState("starting");
    if (sandbox.status !== "running") return emptyState("error", "The preview session ended. Start it again to continue.");
    return previewState(sandbox, includeLogs, signal);
  },

  async snapshot(projectId: string, signal?: AbortSignal, mode?: SnapshotMode, filter?: SnapshotFilter) {
    const sandbox = await runningSandbox(projectId, signal);
    return parseWorkspaceSnapshot(await readWorkspace(sandbox.currentSession(), signal, mode, filter), mode);
  },

  async search(projectId: string, paths: string[], input: CodeSearchInput, signal?: AbortSignal) {
    const sandbox = await runningSandbox(projectId, signal);
    const output = await readWorkspace(sandbox.currentSession(), signal, "search", { paths, search: input });
    return JSON.parse(output) as {
      matches: Array<{ path: string; line: number; column: number; preview: string }>;
      searchedFiles: number;
      truncated: boolean;
    };
  },

  async patchSource(projectId: string, files: RuntimeWorkspace["files"], deletedPaths: string[], signal?: AbortSignal) {
    const sandbox = await runningSandbox(projectId, signal);
    if (await syncFiles(sandbox.currentSession(), files, "overlay", signal, deletedPaths)) {
      await startPreview(sandbox, signal);
    }
  },

  async runCommand(projectId: string, input: RuntimeCommandInput, signal?: AbortSignal) {
    const sandbox = await runningSandbox(projectId, signal);
    const session = sandbox.currentSession();
    const start = Date.now();
    const digest = async () => parseWorkspaceSnapshot(await readWorkspace(session, signal, "digest"), "digest");
    const before = await digest();
    const result = await runWorkspaceCommand(session, input, signal);
    const after = await digest();
    if (result.exitCode === 0 && input.executable === "pnpm" && input.args.some((arg) => ["install", "add", "i"].includes(arg))) {
      await recordDependencies(session, signal);
    }
    return {
      ...result,
      stdout: normalizeRuntimeOutput(result.stdout),
      stderr: normalizeRuntimeOutput(result.stderr),
      changedFiles: changedFiles(before, after),
      durationMs: Date.now() - start,
    };
  },

  async restartPreview(projectId: string, signal?: AbortSignal) {
    const sandbox = await runningSandbox(projectId, signal);
    return startPreview(sandbox, signal);
  },

  async markRevision(projectId: string, revisionId: string | null) {
    const signal = AbortSignal.timeout(10_000);
    const sandbox = await runningSandbox(projectId, signal);
    await writeRevision(sandbox.currentSession(), revisionId, signal);
  },

  async remove(projectId: string) {
    const signal = AbortSignal.timeout(15_000);
    const sandbox = await getSandbox(projectId, signal);
    await sandbox?.delete({ signal });
  },
};
