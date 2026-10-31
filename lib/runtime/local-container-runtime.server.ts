import type { CodeSearchInput } from "@/lib/runtime/source-files.server";
import "server-only";

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  PREVIEW_INSPECTOR_CONTENT,
  PREVIEW_INSPECTOR_PATH,
} from "@/lib/runtime/preview-inspector";
import type {
  RuntimeCommandInput,
  RuntimeState,
  RuntimeWorkspace,
} from "@/lib/runtime/protocol";
import { CREATE_PROJECT_ARGS, PROJECT_DEPENDENCY_STEPS, PROJECT_TEMPLATE_FILES, PROJECT_TEMPLATE_REMOVED, PROJECT_TEMPLATE_SIGNATURE } from "@/lib/runtime/project-template";
import {
  diagnosticsFromOutput,
  fontDownloadFailed,
  normalizeRuntimeOutput,
} from "@/lib/runtime/runtime-diagnostics";

import { SCRIPTS } from "@/lib/runtime/workspace-scripts";
import {
  changedFiles, parseWorkspaceSnapshot, snapshotArgs, workspacePayload,
  COMMAND_OUTPUT_LIMIT, DEPENDENCY_MANIFESTS, PROJECT_ICON_SVG, SNAPSHOT_OUTPUT_LIMIT,
  type CommandResult, type SnapshotFilter, type SnapshotMode, type SyncMode,
} from "@/lib/runtime/workspace-files.server";


const CONTAINER_NAME = process.env.BLOOM_RUNTIME_CONTAINER ?? "bloom-runtime";
const CONTAINER_MEMORY = "4g";
const CONTAINER_CPUS = "4";
const PREVIEW_PORT = 3000;

const NODE_IMAGE = "node:24-bookworm-slim";
const BASE_IMAGE_PACKAGES = ["git", "ca-certificates"];
const BASE_IMAGE_REPOSITORY = "bloom-nextjs-base";
const BASE_IMAGE_BUILD_VERSION = "8";
const BASE_IMAGE_HASH = createHash("sha256")
  .update(
    JSON.stringify({
      buildVersion: BASE_IMAGE_BUILD_VERSION,
      nodeImage: NODE_IMAGE,
      packages: BASE_IMAGE_PACKAGES,
      template: PROJECT_TEMPLATE_SIGNATURE,
    }),
  )
  .digest("hex")
  .slice(0, 16);
const BASE_IMAGE = `${BASE_IMAGE_REPOSITORY}:${BASE_IMAGE_HASH}`;

const PROJECT_LABEL = "bloom.project-id";
const BASE_IMAGE_LABEL = "bloom.base-image";

const WORKSPACE_DIR = "/workspace";
const TEMPLATE_DIR = "/opt/bloom-template";
const PROJECT_SCAFFOLD_DIR = "bloom-project";
const PNPM_STORE_VOLUME = "bloom-pnpm-store";
const PNPM_STORE_DIR = "/pnpm/store";

const ACTIVE_PROJECT_FILE = "/tmp/bloom-active-project-id";
const PREVIEW_PID_FILE = "/tmp/bloom-preview.pid";
const PREVIEW_LOG_FILE = "/tmp/bloom-preview.log";
const PROJECT_INIT_MARKER = `${WORKSPACE_DIR}/node_modules/.bloom-project-initialized`;
const DEPENDENCY_MARKER_FILE = `${WORKSPACE_DIR}/node_modules/.bloom-manifest-hash`;

const DEFAULT_TIMEOUT_MS = 4 * 60_000;
const PROJECT_INIT_TIMEOUT_MS = 8 * 60_000;
const PREVIEW_READY_TIMEOUT_MS = 30_000;

type DockerOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  stdin?: string;
  outputLimit?: number;
};

type ContainerInfo = {
  exists: boolean;
  running: boolean;
  projectId: string | null;
  baseImage: string | null;
};

let runtimeQueue: Promise<void> = Promise.resolve();
let activeContainerProjectId: string | null = null;
let cachedPublishedPort: number | null = null;


function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new Error("Runtime operation cancelled");
  }
}

async function withRuntimeLock<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const previous = runtimeQueue;
  let release!: () => void;
  runtimeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    throwIfAborted(signal);
    return await operation();
  } finally {
    release();
  }
}

function pnpmCommand(args: string[]) {
  return {
    executable: "corepack",
    args: ["pnpm", "--config.dangerouslyAllowAllBuilds=true", ...args],
  };
}

function processSpec(executable: string, args: string[]) {
  return Buffer.from(JSON.stringify([executable, ...args]), "utf8").toString(
    "base64url",
  );
}

function sharedContainerArgs() {
  return [
    "--memory",
    CONTAINER_MEMORY,
    "--cpus",
    CONTAINER_CPUS,
    "--pids-limit",
    "768",
    "--cap-drop",
    "ALL",
    "--cap-add",
    "DAC_OVERRIDE",
    "--cap-add",
    "FOWNER",
    "--security-opt",
    "no-new-privileges:true",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,exec,mode=1777,size=512m",
    "--mount",
    `type=volume,source=${PNPM_STORE_VOLUME},target=${PNPM_STORE_DIR},volume-nocopy`,
    "--ulimit",
    "nofile=4096:4096",
    "--workdir",
    WORKSPACE_DIR,
    "--env",
    "HOME=/tmp/bloom-home",
    "--env",
    "COREPACK_HOME=/root/.cache/node/corepack",
    "--env",
    "NODE_OPTIONS=--max-old-space-size=3072",
    "--env",
    "NEXT_TELEMETRY_DISABLED=1",
    "--env",
    "COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
    "--env",
    "PNPM_CONFIG_PREFER_OFFLINE=true",
    "--env",
    // Keep registry metadata across container replacements, including the image builder.
    `PNPM_CONFIG_CACHE_DIR=${PNPM_STORE_DIR}/metadata`,
    "--env",
    `PNPM_STORE_DIR=${PNPM_STORE_DIR}`,
    "--env",
    `pnpm_config_store_dir=${PNPM_STORE_DIR}`,
  ];
}

function builderContainerArgs() {
  return [
    ...sharedContainerArgs(),
    "--cap-add",
    "CHOWN",
    "--cap-add",
    "SETUID",
    "--cap-add",
    "SETGID",
    "--env",
    "DEBIAN_FRONTEND=noninteractive",
  ];
}

function dockerError(action: string, result: CommandResult) {
  const details = normalizeRuntimeOutput(result.stderr || result.stdout);
  if (/permission denied.*docker|docker\.sock.*permission denied/i.test(details)) {
    return new Error(
      "Bloom cannot access the Docker daemon. Start rootless Docker for your user, or grant your user access to the running Docker daemon, then restart Bloom.",
    );
  }
  if (/cannot connect to the docker daemon|is the docker daemon running/i.test(details)) {
    return new Error(
      "Bloom cannot connect to Docker. Start the Docker daemon (rootless is recommended for local development) and try again.",
    );
  }
  return new Error(`${action} failed${details ? `:\n${details}` : ""}`);
}

function docker(args: string[], options?: DockerOptions): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    const signal = options?.signal;
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Runtime command cancelled"));
      return;
    }

    const child = spawn("docker", args, {
      stdio: [
        options?.stdin === undefined ? "ignore" : "pipe",
        "pipe",
        "pipe",
      ],
      env: process.env,
    });

    const outputLimit = options?.outputLimit ?? COMMAND_OUTPUT_LIMIT;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timedOut = false;
    let outputTruncated = false;

    const append = (chunks: Buffer[], currentBytes: number, chunk: Buffer) => {
      chunks.push(chunk);
      let bytes = currentBytes + chunk.length;

      if (bytes > outputLimit) {
        outputTruncated = true;
        let excess = bytes - outputLimit;

        while (excess > 0 && chunks.length > 0) {
          const first = chunks[0];
          if (first.length <= excess) {
            chunks.shift();
            bytes -= first.length;
            excess -= first.length;
          } else {
            chunks[0] = first.subarray(excess);
            bytes -= excess;
            excess = 0;
          }
        }
      }
      return bytes;
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes = append(stdoutChunks, stdoutBytes, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes = append(stderrChunks, stderrBytes, chunk);
    });

    if (options?.stdin !== undefined && child.stdin) {
      child.stdin.on("error", () => undefined);
      child.stdin.end(options.stdin);
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(error);
    });

    child.once("close", (code, childSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);

      if (signal?.aborted) {
        reject(signal.reason ?? new Error("Runtime command cancelled"));
        return;
      }

      resolve({
        exitCode: code ?? (timedOut ? 124 : childSignal === "SIGKILL" ? 137 : 1),
        stdout: Buffer.concat(stdoutChunks, stdoutBytes).toString("utf8"),
        stderr: Buffer.concat(stderrChunks, stderrBytes).toString("utf8"),
        timedOut,
        outputTruncated,
      });
    });
  });
}

function execNode(
  name: string,
  script: string,
  args: string[],
  options: DockerOptions & { workdir?: string } = {},
) {
  const { workdir, ...dockerOptions } = options;
  return docker(
    [
      "exec",
      ...(options.stdin === undefined ? [] : ["-i"]),
      ...(workdir ? ["--workdir", workdir] : []),
      name,
      "node",
      "-e",
      script,
      ...args,
    ],
    dockerOptions,
  );
}

async function terminateProcess(name: string, pidFile: string, waitForPidMs = 0) {
  const result = await execNode(
    name,
    SCRIPTS.processKiller,
    [pidFile, String(waitForPidMs)],
    { timeoutMs: 10_000 },
  );
  if (result.exitCode !== 0) {
    throw dockerError("Stopping container process", result);
  }
}

async function containerCommand(
  name: string,
  args: string[],
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cwd?: string,
) {
  throwIfAborted(signal);
  const pidFile = `/tmp/bloom-command-${randomUUID()}.pid`;

  try {
    const result = await execNode(
      name,
      SCRIPTS.processRunner,
      [processSpec(args[0], args.slice(1)), pidFile],
      { signal, timeoutMs, workdir: cwd },
    );

    if (result.timedOut) {
      await terminateProcess(name, pidFile, 1_000).catch(() => undefined);
    }
    return result;
  } catch (error) {
    await terminateProcess(name, pidFile, 1_000).catch(() => undefined);
    throw error;
  }
}


async function inspectContainer(
  name: string,
  signal?: AbortSignal,
): Promise<ContainerInfo> {
  const result = await docker(
    [
      "inspect",
      "--format",
      `{{.State.Running}}|{{index .Config.Labels "${PROJECT_LABEL}"}}|{{index .Config.Labels "${BASE_IMAGE_LABEL}"}}`,
      name,
    ],
    { signal, timeoutMs: 30_000 },
  );

  if (result.exitCode === 0) {
    const [runningStr, labelProjectId, baseImage] = result.stdout
      .trimEnd()
      .split("|", 4);
    const running = runningStr === "true";

    if (!running) {
      activeContainerProjectId = null;
      cachedPublishedPort = null;
    } else if (!activeContainerProjectId && name === CONTAINER_NAME) {
      const activeFile = await docker(
        ["exec", name, "sh", "-lc", `cat ${ACTIVE_PROJECT_FILE} 2>/dev/null || true`],
        { signal, timeoutMs: 5_000 },
      );
      const fromFile = activeFile.stdout.trim();
      if (fromFile) {
        activeContainerProjectId = fromFile;
      }
    }

    const effectiveProjectId =
      (name === CONTAINER_NAME && activeContainerProjectId) ||
      (labelProjectId && labelProjectId !== "<no value>" ? labelProjectId : null);

    return {
      exists: true,
      running,
      projectId: effectiveProjectId,
      baseImage: baseImage && baseImage !== "<no value>" ? baseImage : null,
    };
  }

  if (/no such (object|container)/i.test(result.stderr)) {
    activeContainerProjectId = null;
    cachedPublishedPort = null;
    return { exists: false, running: false, projectId: null, baseImage: null };
  }

  throw dockerError("Inspecting project container", result);
}

async function removeContainer(name: string, signal?: AbortSignal) {
  if (name === CONTAINER_NAME) {
    activeContainerProjectId = null;
    cachedPublishedPort = null;
  }
  const result = await docker(["rm", "--force", name], {
    signal,
    timeoutMs: 60_000,
  });
  if (result.exitCode !== 0 && !/no such container/i.test(result.stderr)) {
    throw dockerError("Removing project container", result);
  }
}

async function createContainer(
  name: string,
  projectId: string,
  baseImage: string,
  signal?: AbortSignal,
) {
  const result = await docker(
    [
      "run",
      "--detach",
      "--name",
      name,
      "--label",
      `${PROJECT_LABEL}=${projectId}`,
      "--label",
      `${BASE_IMAGE_LABEL}=${baseImage}`,
      "--init",
      "--publish",
      `127.0.0.1::${PREVIEW_PORT}`,
      ...sharedContainerArgs(),
      baseImage,
      "tail",
      "-f",
      "/dev/null",
    ],
    { signal, timeoutMs: 4 * 60_000 },
  );
  if (result.exitCode !== 0) {
    throw dockerError("Creating project container", result);
  }
  if (name === CONTAINER_NAME) {
    activeContainerProjectId = projectId;
    cachedPublishedPort = null;
  }
}

async function startContainer(name: string, signal?: AbortSignal) {
  const result = await docker(["start", name], {
    signal,
    timeoutMs: 60_000,
  });
  if (result.exitCode !== 0) {
    throw dockerError("Starting project container", result);
  }
  if (name === CONTAINER_NAME) {
    cachedPublishedPort = null;
  }
}

async function ensureProjectContainer(
  projectId: string,
  signal?: AbortSignal,
): Promise<{ switchedProject: boolean }> {
  const baseImage = await ensureBaseImage(signal);
  const info = await inspectContainer(CONTAINER_NAME, signal);

  if (info.exists && info.baseImage !== baseImage) {
    await removeContainer(CONTAINER_NAME, signal);
    await createContainer(CONTAINER_NAME, projectId, baseImage, signal);
    return { switchedProject: false };
  }
  if (!info.exists) {
    await createContainer(CONTAINER_NAME, projectId, baseImage, signal);
    return { switchedProject: false };
  }
  if (!info.running) {
    await startContainer(CONTAINER_NAME, signal);
  }

  const switchedProject = info.projectId !== projectId;
  activeContainerProjectId = projectId;
  return { switchedProject };
}

async function initializeProject(name: string, signal?: AbortSignal) {
  const check = await execNode(
    name,
    SCRIPTS.projectInitMarker,
    [PROJECT_INIT_MARKER, "check"],
    { signal, timeoutMs: 30_000 },
  );
  if (check.exitCode === 0) return;

  const source = `${WORKSPACE_DIR}/${PROJECT_SCAFFOLD_DIR}`;
  const cleanup = await containerCommand(
    name,
    [
      "node",
      "-e",
      "require('node:fs').rmSync(process.argv[1], { recursive: true, force: true })",
      source,
    ],
    signal,
    60_000,
    WORKSPACE_DIR,
  );
  if (cleanup.exitCode !== 0) {
    throw dockerError("Preparing the project workspace", cleanup);
  }

  const init = pnpmCommand(CREATE_PROJECT_ARGS(PROJECT_SCAFFOLD_DIR));
  const initialized = await containerCommand(
    name,
    [init.executable, ...init.args],
    signal,
    PROJECT_INIT_TIMEOUT_MS,
    WORKSPACE_DIR,
  );
  if (initialized.exitCode !== 0) {
    throw dockerError("Creating the project", initialized);
  }

  for (const step of PROJECT_DEPENDENCY_STEPS) {
    const dependencies = pnpmCommand(step);
    const changed = await containerCommand(
      name,
      [dependencies.executable, ...dependencies.args],
      signal,
      PROJECT_INIT_TIMEOUT_MS,
      source,
    );
    if (changed.exitCode !== 0) {
      throw dockerError("Setting up the project's dependencies", changed);
    }
  }

  const moved = await containerCommand(
    name,
    ["node", "-e", SCRIPTS.projectMover, WORKSPACE_DIR, PROJECT_SCAFFOLD_DIR],
    signal,
    60_000,
    WORKSPACE_DIR,
  );
  if (moved.exitCode !== 0) {
    throw dockerError("Moving the generated project into the workspace", moved);
  }

  await syncAndCheckWorkspace(
    name,
    "",
    [
      { path: "app/icon.svg", content: PROJECT_ICON_SVG },
      { path: PREVIEW_INSPECTOR_PATH, content: PREVIEW_INSPECTOR_CONTENT },
      ...PROJECT_TEMPLATE_FILES,
    ],
    "overlay",
    signal,
    PROJECT_TEMPLATE_REMOVED,
  );

  const marked = await execNode(
    name,
    SCRIPTS.projectInitMarker,
    [PROJECT_INIT_MARKER, "write"],
    { signal, timeoutMs: 30_000 },
  );
  if (marked.exitCode !== 0) {
    throw dockerError("Recording project initialization", marked);
  }

  await writeDependencyMarker(name, signal);
}

async function ensureBaseImage(signal?: AbortSignal) {
  const inspected = await docker(["image", "inspect", BASE_IMAGE], {
    signal,
    timeoutMs: 30_000,
  });
  if (inspected.exitCode === 0) {
    return BASE_IMAGE;
  }
  if (!/no such image|no such object/i.test(inspected.stderr)) {
    throw dockerError("Inspecting the prepared runtime image", inspected);
  }

  console.info(
    `[bloom-runtime] Building base image ${BASE_IMAGE} (one-time setup)...`,
  );
  const builder = `bloom-base-builder-${randomUUID()}`;
  const created = await docker(
    [
      "run",
      "--detach",
      "--name",
      builder,
      ...builderContainerArgs(),
      NODE_IMAGE,
      "tail",
      "-f",
      "/dev/null",
    ],
    { signal, timeoutMs: 4 * 60_000 },
  );
  if (created.exitCode !== 0) {
    throw dockerError("Creating the prepared runtime image builder", created);
  }

  try {
    console.info("[bloom-runtime] Step 1/5: Installing system packages & pnpm...");
    const setupPackages = await containerCommand(
      builder,
      [
        "sh",
        "-lc",
        `apt-get update && apt-get install --yes --no-install-recommends ${BASE_IMAGE_PACKAGES.join(" ")} && apt-get clean && rm -rf /var/lib/apt/lists/* && corepack enable pnpm`,
      ],
      signal,
      4 * 60_000,
      WORKSPACE_DIR,
    );
    if (setupPackages.exitCode !== 0) {
      throw dockerError("Setting up base image packages", setupPackages);
    }

    console.info(
      "[bloom-runtime] Step 2/5: Scaffolding Next.js & installing ui-sdk...",
    );
    await initializeProject(builder, signal);

    console.info(
      "[bloom-runtime] Step 3/5: Saving clean source template to /opt/bloom-template...",
    );
    const copiedTemplate = await execNode(
      builder,
      SCRIPTS.copyTemplate,
      [WORKSPACE_DIR, TEMPLATE_DIR],
      { signal, timeoutMs: 60_000 },
    );
    if (copiedTemplate.exitCode !== 0) {
      throw dockerError("Saving clean template directory", copiedTemplate);
    }

    console.info(
      "[bloom-runtime] Step 4/5: Pre-warming Next.js (.next) Turbopack cache...",
    );
    await execNode(
      builder,
      SCRIPTS.warmupNext,
      [WORKSPACE_DIR, String(PREVIEW_PORT)],
      { signal, timeoutMs: 2 * 60_000 },
    );

    console.info("[bloom-runtime] Step 5/5: Committing prepared base image...");
    const committed = await docker(["commit", builder, BASE_IMAGE], {
      signal,
      timeoutMs: 4 * 60_000,
    });
    if (committed.exitCode !== 0) {
      throw dockerError("Saving the prepared runtime image", committed);
    }

    console.info(`[bloom-runtime] Base image ${BASE_IMAGE} is ready!`);
  } finally {
    await removeContainer(builder).catch(() => undefined);
  }

  return BASE_IMAGE;
}


async function writeDependencyMarker(name: string, signal?: AbortSignal) {
  const result = await execNode(
    name,
    SCRIPTS.dependencyMarker,
    [WORKSPACE_DIR, DEPENDENCY_MARKER_FILE, "write", ...DEPENDENCY_MANIFESTS],
    { signal, timeoutMs: 30_000 },
  );
  if (result.exitCode !== 0) {
    throw dockerError("Recording installed project dependencies", result);
  }
}

async function syncAndCheckWorkspace(
  name: string,
  projectId: string,
  files: NonNullable<RuntimeWorkspace["assets"]>,
  mode: SyncMode,
  signal?: AbortSignal,
  deletedPaths: string[] = [],
): Promise<{ previewRunning: boolean; depsMatch: boolean }> {
  const result = await execNode(
    name,
    SCRIPTS.workspaceSyncAndCheck,
    [
      WORKSPACE_DIR,
      mode,
      TEMPLATE_DIR,
      projectId,
      ACTIVE_PROJECT_FILE,
      PREVIEW_PID_FILE,
      DEPENDENCY_MARKER_FILE,
      ...DEPENDENCY_MANIFESTS,
    ],
    { signal, timeoutMs: 60_000, stdin: workspacePayload(files, deletedPaths) },
  );

  if (result.exitCode !== 0) {
    throw dockerError("Synchronizing project workspace", result);
  }

  try {
    return JSON.parse(result.stdout) as {
      previewRunning: boolean;
      depsMatch: boolean;
    };
  } catch {
    return { previewRunning: false, depsMatch: false };
  }
}

async function syncWorkspaceAndDeps(
  name: string,
  workspace: RuntimeWorkspace,
  switchedProject: boolean,
  signal?: AbortSignal,
  deletedPaths?: string[],
): Promise<{ previewNeedsStart: boolean }> {
  const isFreshEmpty =
    workspace.revisionId === null && workspace.files.length === 0;
  const inspector = workspace.files.some(
    (file) => file.path === PREVIEW_INSPECTOR_PATH,
  )
    ? []
    : [{ path: PREVIEW_INSPECTOR_PATH, content: PREVIEW_INSPECTOR_CONTENT }];

  const mode: SyncMode = deletedPaths ? "overlay" : isFreshEmpty || switchedProject ? "reset" : "replace";

  const { previewRunning, depsMatch } = await syncAndCheckWorkspace(
    name,
    workspace.projectId,
    [...workspace.files, ...(workspace.assets ?? []), ...(deletedPaths ? [] : inspector)],
    mode,
    signal,
    deletedPaths,
  );

  let dependenciesChanged = false;
  if (
    (deletedPaths || workspace.files.some((file) => file.path === "package.json")) &&
    !depsMatch
  ) {
    const command = pnpmCommand(["install", "--prefer-offline"]);
    const result = await containerCommand(
      name,
      [command.executable, ...command.args],
      signal,
      4 * 60_000,
      WORKSPACE_DIR,
    );
    if (result.exitCode !== 0) {
      throw dockerError("Installing dependencies", result);
    }
    await writeDependencyMarker(name, signal);
    dependenciesChanged = true;
  }

  return { previewNeedsStart: !previewRunning || dependenciesChanged };
}

async function executeSourceReader(
  name: string,
  signal?: AbortSignal,
  mode: SnapshotMode = "full",
  filter: SnapshotFilter = {},
) {
  const result = await execNode(
    name,
    SCRIPTS.sourceSnapshotReader,
    snapshotArgs(WORKSPACE_DIR, mode, filter),
    {
      signal,
      timeoutMs: 60_000,
      outputLimit: SNAPSHOT_OUTPUT_LIMIT,
    },
  );

  if (result.exitCode !== 0) {
    throw dockerError("Reading project workspace", result);
  }
  if (result.outputTruncated) {
    throw new Error("Project source snapshot exceeded the transfer limit");
  }

  return result.stdout;
}

async function readContainerSourceSnapshot(
  name: string,
  signal?: AbortSignal,
  mode?: SnapshotMode,
  filter?: SnapshotFilter,
): Promise<RuntimeWorkspace["files"]> {
  const output = await executeSourceReader(name, signal, mode, filter);
  return parseWorkspaceSnapshot(output, mode);
}

async function previewIsRunning(name: string, signal?: AbortSignal) {
  const result = await docker(
    [
      "exec",
      name,
      "sh",
      "-lc",
      `test -s ${PREVIEW_PID_FILE} && kill -0 "$(cat ${PREVIEW_PID_FILE})"`,
    ],
    { signal, timeoutMs: 5_000 },
  );
  return result.exitCode === 0;
}

async function stopPreview(name: string) {
  await terminateProcess(name, PREVIEW_PID_FILE);
}

async function readPreviewLogs(name: string, signal?: AbortSignal) {
  const result = await docker(
    [
      "exec",
      name,
      "sh",
      "-lc",
      `tail -c ${COMMAND_OUTPUT_LIMIT} ${PREVIEW_LOG_FILE} 2>/dev/null || true`,
    ],
    { signal, timeoutMs: 30_000 },
  );
  return normalizeRuntimeOutput(result.stdout || result.stderr);
}

async function publishedPort(name: string, signal?: AbortSignal) {
  if (name === CONTAINER_NAME && cachedPublishedPort !== null) {
    return cachedPublishedPort;
  }

  const result = await docker(["port", name, `${PREVIEW_PORT}/tcp`], {
    signal,
    timeoutMs: 30_000,
  });
  if (result.exitCode !== 0) {
    throw dockerError("Reading project preview port", result);
  }

  const match = result.stdout.trim().split("\n")[0]?.match(/:(\d+)$/);
  const port = match?.[1] ? Number(match[1]) : 0;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Docker did not report the project's preview port.");
  }
  if (name === CONTAINER_NAME) {
    cachedPublishedPort = port;
  }
  return port;
}

async function previewResponds(
  port: number,
  timeoutMs = 2_000,
  signal?: AbortSignal,
) {
  try {
    const combinedSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    const response = await fetch(`http://127.0.0.1:${port}`, {
      signal: combinedSignal,
    });
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

async function previewListens(name: string, signal?: AbortSignal) {
  // Probe inside Docker so the published-port proxy cannot report false readiness.
  const result = await docker([
    "exec", name, "node", "-e", `
      const socket = require("node:net").connect({
        host: "127.0.0.1", port: Number(process.argv[1]), timeout: 1_000,
      });
      socket.once("connect", () => socket.destroy());
      socket.once("error", () => { process.exitCode = 1; });
      socket.once("timeout", () => { process.exitCode = 1; socket.destroy(); });
    `, String(PREVIEW_PORT),
  ], { signal, timeoutMs: 5_000 });
  return result.exitCode === 0;
}

async function waitForPreview(name: string, signal?: AbortSignal) {
  const port = await publishedPort(name, signal);
  const deadline = Date.now() + PREVIEW_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    throwIfAborted(signal);
    if (await previewResponds(port, 12_000, signal)) return port;
    if (!(await previewIsRunning(name, signal))) {
      const logs = await readPreviewLogs(name, signal);
      throw new Error(
        `Project preview exited during startup${logs ? `:\n${logs}` : ""}`,
      );
    }
    await delay(200, undefined, { signal });
  }

  const logs = await readPreviewLogs(name, signal);
  throw new Error(
    `Project preview did not become ready within ${PREVIEW_READY_TIMEOUT_MS / 1_000} seconds${logs ? `:\n${logs}` : ""}`,
  );
}

async function startPreview(name: string, signal?: AbortSignal) {
  throwIfAborted(signal);
  await stopPreview(name);

  const nextBin = `${WORKSPACE_DIR}/node_modules/next/dist/bin/next`;
  const result = await docker(
    [
      "exec",
      "--detach",
      "--workdir",
      WORKSPACE_DIR,
      name,
      "node",
      "-e",
      SCRIPTS.processRunner,
      processSpec("node", [
        nextBin,
        "dev",
        "--turbopack",
        "--hostname",
        "0.0.0.0",
        "--port",
        String(PREVIEW_PORT),
      ]),
      PREVIEW_PID_FILE,
      PREVIEW_LOG_FILE,
    ],
    { signal, timeoutMs: 30_000 },
  );
  if (result.exitCode !== 0) {
    throw dockerError("Starting project preview", result);
  }

  try {
    return await waitForPreview(name, signal);
  } catch (error) {
    await stopPreview(name).catch(() => undefined);
    throw error;
  }
}

function idleRuntimeState(): RuntimeState {
  return {
    status: "idle",
    previewUrl: null,
    revisionId: null,
    logs: [],
    diagnostics: [],
    error: null,
  };
}

function buildRuntimeState(
  status: "ready" | "starting" | "error",
  port: number,
  revisionId: string | null,
  logs: string,
): RuntimeState {
  return {
    status,
    // Next dev accepts *.localhost for its browser transport. Keep preview
    // cookies on a separate host from Bloom's own localhost session.
    previewUrl: status === "ready" ? `http://bloom-preview.localhost:${port}` : null,
    revisionId,
    logs: logs ? [logs] : [],
    diagnostics: diagnosticsFromOutput(logs),
    error: null,
  };
}

class LocalContainerRuntime {
  async ensure(workspace: RuntimeWorkspace, signal?: AbortSignal) {
    return withRuntimeLock(async () => {
      const { switchedProject } = await ensureProjectContainer(
        workspace.projectId,
        signal,
      );
      const { previewNeedsStart } = await syncWorkspaceAndDeps(
        CONTAINER_NAME,
        workspace,
        switchedProject,
        signal,
      );
      const port = previewNeedsStart || fontDownloadFailed(await readPreviewLogs(CONTAINER_NAME, signal))
        ? await startPreview(CONTAINER_NAME, signal)
        : await waitForPreview(CONTAINER_NAME, signal);
      const logs = await readPreviewLogs(CONTAINER_NAME, signal);

      return buildRuntimeState("ready", port, workspace.revisionId, logs);
    }, signal);
  }

  async snapshot(projectId: string, signal?: AbortSignal, mode?: SnapshotMode, filter?: SnapshotFilter) {
    return withRuntimeLock(async () => {
      const active = await inspectContainer(CONTAINER_NAME, signal);
      if (
        !active.exists ||
        !active.running ||
        active.projectId !== projectId
      ) {
        throw new Error("Project runtime is not prepared");
      }
      return readContainerSourceSnapshot(CONTAINER_NAME, signal, mode, filter);
    }, signal);
  }

  async search(projectId: string, paths: string[], input: CodeSearchInput, signal?: AbortSignal) {
    return withRuntimeLock(async () => {
      const active = await inspectContainer(CONTAINER_NAME, signal);
      if (!active.running || active.projectId !== projectId) {
        throw new Error("Project runtime is not prepared");
      }
      const output = await executeSourceReader(CONTAINER_NAME, signal, "search", {
        paths, search: input,
      });
      return JSON.parse(output) as {
        matches: Array<{ path: string; line: number; column: number; preview: string }>;
        searchedFiles: number;
        truncated: boolean;
      };
    }, signal);
  }

  async patchSource(
    projectId: string,
    files: RuntimeWorkspace["files"],
    deletedPaths: string[],
    signal?: AbortSignal,
  ) {
    return withRuntimeLock(async () => {
      const active = await inspectContainer(CONTAINER_NAME, signal);
      if (!active.running || active.projectId !== projectId) {
        throw new Error("Project runtime is not prepared");
      }
      const { previewNeedsStart } = await syncWorkspaceAndDeps(
        CONTAINER_NAME, { projectId, revisionId: null, files }, false, signal, deletedPaths,
      );
      if (previewNeedsStart) await startPreview(CONTAINER_NAME, signal);
    }, signal);
  }

  async runCommand(
    projectId: string,
    input: RuntimeCommandInput,
    signal?: AbortSignal,
  ) {
    return withRuntimeLock(async () => {
      const active = await inspectContainer(CONTAINER_NAME, signal);
      if (!active.running || active.projectId !== projectId) {
        throw new Error("Project runtime is not prepared");
      }
      const startedAt = Date.now();
      const before = await readContainerSourceSnapshot(
        CONTAINER_NAME,
        signal,
        "digest",
      );
      const command =
        input.executable === "pnpm"
          ? pnpmCommand(input.args)
          : { executable: input.executable, args: input.args };

      const result = await containerCommand(
        CONTAINER_NAME,
        [command.executable, ...command.args],
        signal,
        input.timeoutMs,
        input.cwd === "." ? WORKSPACE_DIR : `${WORKSPACE_DIR}/${input.cwd}`,
      );

      const after = await readContainerSourceSnapshot(
        CONTAINER_NAME,
        signal,
        "digest",
      );

      if (
        result.exitCode === 0 &&
        input.executable === "pnpm" &&
        input.args.some((arg) => ["install", "add", "i"].includes(arg))
      ) {
        await writeDependencyMarker(CONTAINER_NAME, signal);
      }

      if (!(await previewIsRunning(CONTAINER_NAME, signal))) {
        await startPreview(CONTAINER_NAME).catch(() => undefined);
      }

      return {
        exitCode: result.exitCode,
        stdout: normalizeRuntimeOutput(result.stdout),
        stderr: normalizeRuntimeOutput(result.stderr),
        durationMs: Date.now() - startedAt,
        timedOut: result.timedOut,
        outputTruncated: result.outputTruncated,
        changedFiles: changedFiles(before, after),
      };
    }, signal);
  }

  async restartPreview(projectId: string, signal?: AbortSignal) {
    return withRuntimeLock(async () => {
      const active = await inspectContainer(CONTAINER_NAME, signal);
      if (!active.exists || active.projectId !== projectId) {
        throw new Error("Project runtime is not prepared");
      }
      if (!active.running) {
        await startContainer(CONTAINER_NAME, signal);
      }

      const port = await startPreview(CONTAINER_NAME, signal);
      const logs = await readPreviewLogs(CONTAINER_NAME, signal);

      return buildRuntimeState("ready", port, null, logs);
    }, signal);
  }

  async getState(projectId: string, signal?: AbortSignal, includeLogs = true): Promise<RuntimeState> {
    const info = await inspectContainer(CONTAINER_NAME, signal);
    if (!info.exists || !info.running || info.projectId !== projectId) {
      return idleRuntimeState();
    }

    const [port, output] = await Promise.all([
      publishedPort(CONTAINER_NAME, signal),
      readPreviewLogs(CONTAINER_NAME, signal),
    ]);
    const logs = includeLogs ? output : "";

    if (await previewListens(CONTAINER_NAME, signal)) {
      if (!fontDownloadFailed(output)) return buildRuntimeState("ready", port, null, logs);
      return {
        ...buildRuntimeState("error", port, null, logs),
        error: "The preview could not download its Google fonts. Restart it to continue.",
      };
    }
    if (await previewIsRunning(CONTAINER_NAME, signal)) {
      return buildRuntimeState("starting", port, null, logs);
    }
    return {
      ...buildRuntimeState("error", port, null, logs),
      error: "The preview process stopped. Restart it to continue.",
    };
  }
}

export const container = new LocalContainerRuntime();
