import "server-only";

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  PREVIEW_INSPECTOR_CONTENT,
  PREVIEW_INSPECTOR_MARKER,
  PREVIEW_INSPECTOR_PATH,
} from "@/lib/runtime/preview-inspector";
import { NEXTJS_STARTER_FILES } from "@/ai/templates/nextjs";
import type {
  RuntimeCommandInput,
  RuntimeState,
  RuntimeWorkspace,
} from "@/lib/runtime/protocol";
import {
  diagnosticsFromOutput,
  normalizeRuntimeOutput,
} from "@/lib/runtime/runtime-diagnostics";

const PREVIEW_PORT = 3000;
const NODE_IMAGE = "node:24-bookworm-slim";
const CONTAINER_NAME = "bloom-runtime";
const PROJECT_LABEL = "bloom.project-id";
const PNPM_STORE_VOLUME = "bloom-pnpm-store";
const PNPM_STORE_DIR = "/pnpm/store";
const WORKSPACE_DIR = "/workspace";
const BASE_TEMPLATE_DIR = "/opt/bloom-template";
const BASE_IMAGE_BUILD_VERSION = "2";
const BASE_IMAGE_LABEL = "bloom.base-image";
const PREVIEW_PID_FILE = "/tmp/bloom-preview.pid";
const PREVIEW_LOG_FILE = "/tmp/bloom-preview.log";
const CONTAINER_MEMORY = "2g";
const CONTAINER_CPUS = "2";
const COMMAND_OUTPUT_LIMIT = 100_000;
const SNAPSHOT_OUTPUT_LIMIT = 32_000_000;
const MAX_SOURCE_FILE_BYTES = 1_000_000;
const MAX_SOURCE_FILES = 500;
const MAX_SOURCE_BYTES = 20_000_000;
const DEFAULT_TIMEOUT_MS = 4 * 60_000;
const PREVIEW_READY_TIMEOUT_MS = 30_000;
const DEPENDENCY_MARKER_FILE = "/workspace/node_modules/.bloom-manifest-hash";
const DEPENDENCY_MANIFESTS = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
];
const BASE_IMAGE_REPOSITORY = "bloom-nextjs-base";
const BASE_IMAGE_HASH = createHash("sha256")
  .update(
    JSON.stringify({
      buildVersion: BASE_IMAGE_BUILD_VERSION,
      nodeImage: NODE_IMAGE,
      files: NEXTJS_STARTER_FILES,
    }),
  )
  .digest("hex")
  .slice(0, 16);
const BASE_IMAGE = `${BASE_IMAGE_REPOSITORY}:${BASE_IMAGE_HASH}`;
const SNAPSHOT_EXCLUDES = [
  ".git",
  ".next",
  "node_modules",
  "coverage",
  ".cache",
  ".turbo",
  "dist",
  "build",
  "bloom-generated-assets",
];

const PROCESS_RUNNER = String.raw`
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const [encoded, pidFile, logFile = ""] = process.argv.slice(1);
const [executable, ...args] = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
const log = logFile ? fs.openSync(logFile, "w") : null;
const child = spawn(executable, args, {
  detached: true,
  env: process.env,
  stdio: log === null ? ["ignore", "inherit", "inherit"] : ["ignore", log, log],
});
const cleanup = () => { try { fs.rmSync(pidFile, { force: true }); } catch {} };
child.once("spawn", () => {
  fs.writeFileSync(pidFile, String(child.pid), "utf8");
  if (log !== null) fs.closeSync(log);
});
child.once("error", (error) => {
  if (logFile) { try { fs.appendFileSync(logFile, String(error?.stack || error) + "\\n"); } catch {} }
  else console.error(error?.stack || error);
  cleanup();
  process.exit(1);
});
child.once("close", (code, signal) => {
  cleanup();
  process.exit(code ?? (signal === "SIGKILL" ? 137 : signal === "SIGTERM" ? 143 : 1));
});
`;

const PROCESS_KILLER = String.raw`
const fs = require("node:fs");
const [pidFile, waitMs = "0"] = process.argv.slice(1);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  let pid;
  const deadline = Date.now() + Number(waitMs);
  do {
    try {
      const value = Number(fs.readFileSync(pidFile, "utf8").trim());
      if (Number.isInteger(value) && value > 0) { pid = value; break; }
    } catch {}
    if (Date.now() >= deadline) break;
    await sleep(25);
  } while (true);
  if (!pid) { try { fs.rmSync(pidFile, { force: true }); } catch {} return; }
  const alive = () => { try { process.kill(-pid, 0); return true; } catch { return false; } };
  try { process.kill(-pid, "SIGTERM"); } catch {}
  for (let i = 0; i < 10 && alive(); i += 1) await sleep(50);
  if (alive()) { try { process.kill(-pid, "SIGKILL"); } catch {} }
  try { fs.rmSync(pidFile, { force: true }); } catch {}
})();
`;

const WORKSPACE_WRITER = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[1];
const templateRoot = process.argv[2] || "";
const rootPath = path.resolve(root);
const input = fs.readFileSync(0, "utf8");
const payload = JSON.parse(input);

if (!Array.isArray(payload)) {
  throw new Error("Invalid workspace payload");
}

const seen = new Set();
const files = payload.map((file) => {
  if (
    !file ||
    typeof file.path !== "string" ||
    typeof file.content !== "string"
  ) {
    throw new Error("Invalid workspace file");
  }

  const target = path.resolve(rootPath, file.path);
  if (target === rootPath || !target.startsWith(rootPath + path.sep)) {
    throw new Error("Invalid runtime path: " + file.path);
  }
  if (seen.has(file.path)) {
    throw new Error("Duplicate runtime path: " + file.path);
  }
  seen.add(file.path);

  return {
    path: file.path,
    target,
    content: Buffer.from(file.content, "base64"),
  };
});

for (const file of files) {
  const segments = file.path.split("/");
  let parent = "";
  for (let index = 0; index < segments.length - 1; index += 1) {
    parent = parent ? parent + "/" + segments[index] : segments[index];
    if (seen.has(parent)) {
      throw new Error("Runtime path conflicts with file: " + parent);
    }
  }
}

fs.mkdirSync(rootPath, { recursive: true });
for (const entry of fs.readdirSync(rootPath)) {
  if (entry === "node_modules" || entry === ".next") continue;
  fs.rmSync(path.join(rootPath, entry), { recursive: true, force: true });
}

if (templateRoot) {
  fs.cpSync(templateRoot, rootPath, { recursive: true });
}

for (const file of files) {
  if (templateRoot && file.path === "package.json") {
    const basePackage = JSON.parse(
      fs.readFileSync(path.join(templateRoot, "package.json"), "utf8"),
    );
    const projectPackage = JSON.parse(file.content.toString("utf8"));
    file.content = Buffer.from(
      JSON.stringify(
        {
          ...projectPackage,
          dependencies: {
            ...(basePackage.dependencies || {}),
            ...(projectPackage.dependencies || {}),
          },
          devDependencies: {
            ...(basePackage.devDependencies || {}),
            ...(projectPackage.devDependencies || {}),
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  }
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.writeFileSync(file.target, file.content);
}
`;

const TEMPLATE_CACHER = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const [source, target] = process.argv.slice(1);
const excluded = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  ".cache",
  ".turbo",
  "dist",
  "build",
]);

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, {
  recursive: true,
  filter: (entry) => entry === source || !excluded.has(path.basename(entry)),
});
`;

const DEPENDENCY_MARKER = String.raw`
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const [root, marker, action, ...manifests] = process.argv.slice(1);
const hash = crypto.createHash("sha256");

for (const manifest of manifests) {
  const target = path.join(root, manifest);
  hash.update(manifest + "\0");
  try {
    hash.update(fs.readFileSync(target));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  hash.update("\0");
}

const digest = hash.digest("hex");
if (action === "write") {
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, digest, "utf8");
} else {
  let saved = "";
  try { saved = fs.readFileSync(marker, "utf8").trim(); } catch {}
  process.exit(saved === digest ? 0 : 1);
}
`;

const SOURCE_SNAPSHOT_READER = String.raw`
const fs = require("node:fs");
const path = require("node:path");

const [
  root,
  encodedExcludes,
  maxFileBytesValue,
  maxFilesValue,
  maxTotalBytesValue,
] = process.argv.slice(1);

const excludes = new Set(
  JSON.parse(Buffer.from(encodedExcludes, "base64url").toString("utf8")),
);
const maxFileBytes = Number(maxFileBytesValue);
const maxFiles = Number(maxFilesValue);
const maxTotalBytes = Number(maxTotalBytesValue);
const files = [];
const pending = [{ directory: root, prefix: "" }];
let totalBytes = 0;

while (pending.length > 0) {
  const current = pending.pop();

  for (const entry of fs.readdirSync(current.directory, {
    withFileTypes: true,
  })) {
    if (excludes.has(entry.name)) continue;

    const relative = current.prefix
      ? current.prefix + "/" + entry.name
      : entry.name;
    const absolute = path.join(current.directory, entry.name);

    if (entry.isDirectory()) {
      pending.push({ directory: absolute, prefix: relative });
      continue;
    }
    if (!entry.isFile()) continue;

    const info = fs.statSync(absolute);
    if (info.size > maxFileBytes) continue;

    const content = fs.readFileSync(absolute);
    if (content.length > maxFileBytes || content.includes(0)) continue;

    totalBytes += content.length;
    if (totalBytes > maxTotalBytes) {
      throw new Error("Project exceeds the source snapshot size limit");
    }
    if (files.length >= maxFiles) {
      throw new Error("Project exceeds the source snapshot file limit");
    }

    files.push({
      path: relative,
      content: content.toString("base64"),
    });
  }
}

files.sort((a, b) => a.path.localeCompare(b.path));
process.stdout.write(JSON.stringify(files));
`;

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputTruncated: boolean;
};

type ContainerInfo = {
  exists: boolean;
  running: boolean;
  projectId: string | null;
  baseImage: string | null;
};

function pnpmCommand(args: string[]) {
  return {
    executable: "corepack",
    args: [
      "pnpm",
      "--config.dangerouslyAllowAllBuilds=true",
      ...args,
    ],
  };
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
    // NOTE: Docker mounts tmpfs with noexec by default, so exec must be set
    // explicitly. HOME is /tmp/bloom-home and Corepack downloads the
    // pnpm-native binary under $HOME, which fails with EACCES on a noexec
    // mount. COREPACK_HOME keeps exec binaries off /tmp entirely as
    // belt-and-suspenders.
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
    "NODE_OPTIONS=--max-old-space-size=1536",
    "--env",
    "NEXT_TELEMETRY_DISABLED=1",
    "--env",
    "COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
    "--env",
    `PNPM_STORE_DIR=${PNPM_STORE_DIR}`,
    "--env",
    `pnpm_config_store_dir=${PNPM_STORE_DIR}`,
  ];
}

let runtimeQueue: Promise<void> = Promise.resolve();

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

function docker(
  args: string[],
  options?: {
    signal?: AbortSignal;
    timeoutMs?: number;
    stdin?: string;
    outputLimit?: number;
  },
): Promise<CommandResult> {
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

    const append = (
      chunks: Buffer[],
      currentBytes: number,
      chunk: Buffer,
    ) => {
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
        exitCode:
          code ?? (timedOut ? 124 : childSignal === "SIGKILL" ? 137 : 1),
        stdout: Buffer.concat(stdoutChunks, stdoutBytes).toString("utf8"),
        stderr: Buffer.concat(stderrChunks, stderrBytes).toString("utf8"),
        timedOut,
        outputTruncated,
      });
    });
  });
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
    const [running, projectId, baseImage] = result.stdout
      .trimEnd()
      .split("|", 4);
    return {
      exists: true,
      running: running === "true",
      projectId: projectId && projectId !== "<no value>" ? projectId : null,
      baseImage: baseImage && baseImage !== "<no value>" ? baseImage : null,
    };
  }
  if (/no such (object|container)/i.test(result.stderr)) {
    return {
      exists: false,
      running: false,
      projectId: null,
      baseImage: null,
    };
  }
  throw dockerError("Inspecting project container", result);
}

async function removeContainer(name: string, signal?: AbortSignal) {
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
}

async function startContainer(name: string, signal?: AbortSignal) {
  const result = await docker(["start", name], {
    signal,
    timeoutMs: 60_000,
  });
  if (result.exitCode !== 0) {
    throw dockerError("Starting project container", result);
  }
}

async function ensureProjectContainer(
  projectId: string,
  signal?: AbortSignal,
) {
  const baseImage = await ensureBaseImage(signal);
  const info = await inspectContainer(CONTAINER_NAME, signal);

  const mustRecreate =
    info.exists &&
    (info.projectId !== projectId || info.baseImage !== baseImage);

  if (mustRecreate) {
    await removeContainer(CONTAINER_NAME, signal);
    await createContainer(CONTAINER_NAME, projectId, baseImage, signal);
    return;
  }
  if (!info.exists) {
    await createContainer(CONTAINER_NAME, projectId, baseImage, signal);
    return;
  }
  if (!info.running) {
    await startContainer(CONTAINER_NAME, signal);
  }
}

function processSpec(executable: string, args: string[]) {
  return Buffer.from(JSON.stringify([executable, ...args]), "utf8").toString(
    "base64url",
  );
}

async function terminateProcess(
  name: string,
  pidFile: string,
  waitForPidMs = 0,
) {
  const result = await docker(
    [
      "exec",
      name,
      "node",
      "-e",
      PROCESS_KILLER,
      pidFile,
      String(waitForPidMs),
    ],
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
    const result = await docker(
      [
        "exec",
        ...(cwd ? ["--workdir", cwd] : []),
        name,
        "node",
        "-e",
        PROCESS_RUNNER,
        processSpec(args[0], args.slice(1)),
        pidFile,
      ],
      { signal, timeoutMs },
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

async function writeWorkspaceFiles(
  name: string,
  files: Array<
    RuntimeWorkspace["files"][number] & { encoding?: "base64" }
  >,
  signal?: AbortSignal,
  templateRoot = "",
) {
  const payload = JSON.stringify(
    files.map((file) => ({
      path: file.path,
      content: file.encoding === "base64"
        ? file.content
        : Buffer.from(file.content, "utf8").toString("base64"),
    })),
  );
  const result = await docker(
    [
      "exec",
      "-i",
      name,
      "node",
      "-e",
      WORKSPACE_WRITER,
      WORKSPACE_DIR,
      templateRoot,
    ],
    {
      signal,
      timeoutMs: 60_000,
      stdin: payload,
    },
  );

  if (result.exitCode !== 0) {
    throw dockerError("Synchronizing project workspace", result);
  }
}

async function dependencyMarkerMatches(
  name: string,
  signal?: AbortSignal,
) {
  const result = await docker(
    [
      "exec",
      name,
      "node",
      "-e",
      DEPENDENCY_MARKER,
      WORKSPACE_DIR,
      DEPENDENCY_MARKER_FILE,
      "check",
      ...DEPENDENCY_MANIFESTS,
    ],
    { signal, timeoutMs: 30_000 },
  );
  return result.exitCode === 0;
}

async function writeDependencyMarker(
  name: string,
  signal?: AbortSignal,
) {
  const result = await docker(
    [
      "exec",
      name,
      "node",
      "-e",
      DEPENDENCY_MARKER,
      WORKSPACE_DIR,
      DEPENDENCY_MARKER_FILE,
      "write",
      ...DEPENDENCY_MANIFESTS,
    ],
    { signal, timeoutMs: 30_000 },
  );
  if (result.exitCode !== 0) {
    throw dockerError("Recording installed project dependencies", result);
  }
}

async function ensureBaseImage(signal?: AbortSignal) {
  const inspected = await docker(["image", "inspect", BASE_IMAGE], {
    signal,
    timeoutMs: 30_000,
  });
  if (inspected.exitCode === 0) {
    // Best-effort cleanup of superseded base images (e.g. the legacy
    // unversioned `:latest` tag or hashes from older template versions).
    // Never fails the ensure path; an image still referenced by a running
    // container simply won't remove until the container is recreated.
    await pruneOldBaseImages(BASE_IMAGE, signal).catch(() => undefined);
    return BASE_IMAGE;
  }
  if (!/no such image|no such object/i.test(inspected.stderr)) {
    throw dockerError("Inspecting the prepared runtime image", inspected);
  }

  const builder = `bloom-base-builder-${randomUUID()}`;
  const created = await docker(
    [
      "run",
      "--detach",
      "--name",
      builder,
      ...sharedContainerArgs(),
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
    await writeWorkspaceFiles(builder, NEXTJS_STARTER_FILES, signal);

    const corepack = await containerCommand(
      builder,
      ["corepack", "enable", "pnpm"],
      signal,
      30_000,
      WORKSPACE_DIR,
    );
    if (corepack.exitCode !== 0) {
      throw dockerError("Enabling pnpm in the prepared runtime image", corepack);
    }

    const install = pnpmCommand(["install"]);
    const installed = await containerCommand(
      builder,
      [install.executable, ...install.args],
      signal,
      4 * 60_000,
      WORKSPACE_DIR,
    );
    if (installed.exitCode !== 0) {
      throw dockerError("Installing prepared runtime dependencies", installed);
    }

    const shadcn = pnpmCommand([
      "exec",
      "shadcn",
      "add",
      "--all",
      "--yes",
      "--overwrite",
    ]);

    const components = await containerCommand(
      builder,
      [shadcn.executable, ...shadcn.args],
      signal,
      DEFAULT_TIMEOUT_MS,
      WORKSPACE_DIR,
    );

    if (components.exitCode !== 0) {
      throw dockerError("Preparing shadcn components", components);
    }

    await writeDependencyMarker(builder, signal);

    const cached = await docker(
      [
        "exec",
        builder,
        "node",
        "-e",
        TEMPLATE_CACHER,
        WORKSPACE_DIR,
        BASE_TEMPLATE_DIR,
      ],
      { signal, timeoutMs: 60_000 },
    );
    if (cached.exitCode !== 0) {
      throw dockerError("Caching the prepared project template", cached);
    }

    const committed = await docker(["commit", builder, BASE_IMAGE], {
      signal,
      timeoutMs: 4 * 60_000,
    });

    if (committed.exitCode !== 0) {
      throw dockerError("Saving the prepared runtime image", committed);
    }

    await pruneOldBaseImages(BASE_IMAGE, signal).catch(() => undefined);
  } finally {
    await removeContainer(builder).catch(() => undefined);
  }

  return BASE_IMAGE;
}

async function pruneOldBaseImages(current: string, signal?: AbortSignal) {
  const listed = await docker(
    ["images", BASE_IMAGE_REPOSITORY, "--format", "{{.Repository}}:{{.Tag}}"],
    { signal, timeoutMs: 30_000 },
  );
  if (listed.exitCode !== 0) return;

  const stale = listed.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (tag) =>
        tag.startsWith(`${BASE_IMAGE_REPOSITORY}:`) && tag !== current,
    );
  for (const tag of stale) {
    // Best-effort: `rmi` fails while an old container still references the
    // image; the next ensure cycle recreates the container and prunes again.
    const removed = await docker(["rmi", tag], {
      signal,
      timeoutMs: 60_000,
    }).catch(() => undefined);
    if (removed && removed.exitCode !== 0) continue;
  }
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

async function syncWorkspace(
  name: string,
  workspace: RuntimeWorkspace,
  signal?: AbortSignal,
  seedFromTemplate = false,
) {
  const previewWasRunning = await previewIsRunning(name, signal);
  const inspector = workspace.files.some((file) => file.path === PREVIEW_INSPECTOR_PATH)
    ? []
    : [{ path: PREVIEW_INSPECTOR_PATH, content: PREVIEW_INSPECTOR_CONTENT }];
  await writeWorkspaceFiles(
    name,
    [...workspace.files, ...(workspace.assets ?? []), ...inspector],
    signal,
    seedFromTemplate ? BASE_TEMPLATE_DIR : "",
  );

  return !previewWasRunning;
}

async function ensureDependencies(
  name: string,
  workspace: RuntimeWorkspace,
  signal?: AbortSignal,
) {
  if (!workspace.files.some((file) => file.path === "package.json")) {
    return false;
  }
  if (await dependencyMarkerMatches(name, signal)) return false;

  const corepack = await containerCommand(
    name,
    ["corepack", "enable", "pnpm"],
    signal,
    30_000,
    WORKSPACE_DIR,
  );
  if (corepack.exitCode !== 0) {
    throw dockerError("Enabling pnpm for project tools", corepack);
  }

  const command = pnpmCommand(["install"]);

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
  return true;
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
  return port;
}

async function previewResponds(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(1_000),
    });
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

async function waitForPreview(name: string, signal?: AbortSignal) {
  const port = await publishedPort(name, signal);
  const processDeadline = Date.now() + 2_000;

  while (Date.now() < processDeadline) {
    throwIfAborted(signal);
    if (await previewIsRunning(name, signal)) break;
    await delay(50, undefined, { signal });
  }

  const deadline = Date.now() + PREVIEW_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    if (!(await previewIsRunning(name, signal))) {
      const logs = await readPreviewLogs(name, signal);
      throw new Error(
        `Project preview exited during startup${logs ? `:\n${logs}` : ""}`,
      );
    }
    if (await previewResponds(port)) return port;
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

  const command = pnpmCommand(["run", "dev", "--hostname", "0.0.0.0"]);
  const result = await docker(
    [
      "exec",
      "--detach",
      "--workdir",
      WORKSPACE_DIR,
      name,
      "node",
      "-e",
      PROCESS_RUNNER,
      processSpec(command.executable, command.args),
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

async function readContainerSourceSnapshot(
  name: string,
  signal?: AbortSignal,
) {
  const encodedExcludes = Buffer.from(
    JSON.stringify(SNAPSHOT_EXCLUDES),
    "utf8",
  ).toString("base64url");
  const result = await docker(
    [
      "exec",
      name,
      "node",
      "-e",
      SOURCE_SNAPSHOT_READER,
      WORKSPACE_DIR,
      encodedExcludes,
      String(MAX_SOURCE_FILE_BYTES),
      String(MAX_SOURCE_FILES),
      String(MAX_SOURCE_BYTES),
    ],
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

  let files: Array<{ path: string; content: string }>;
  try {
    files = JSON.parse(result.stdout) as Array<{
      path: string;
      content: string;
    }>;
  } catch {
    throw new Error("Project source snapshot was invalid");
  }

  if (!Array.isArray(files)) {
    throw new Error("Project source snapshot was invalid");
  }

  return files.flatMap((file) => {
    if (
      !file ||
      typeof file.path !== "string" ||
      typeof file.content !== "string"
    ) {
      throw new Error("Project source snapshot was invalid");
    }

    const content = Buffer.from(file.content, "base64").toString("utf8");
    return file.path === PREVIEW_INSPECTOR_PATH && content.startsWith(PREVIEW_INSPECTOR_MARKER)
      ? []
      : [{ path: file.path, content }];
  });
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

function changedFiles(
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

class LocalContainerRuntime {
  async ensure(workspace: RuntimeWorkspace, signal?: AbortSignal) {
    return withRuntimeLock(async () => {
      await ensureProjectContainer(workspace.projectId, signal);
      const previewNeedsStart = await syncWorkspace(
        CONTAINER_NAME,
        workspace,
        signal,
        workspace.revisionId === null && workspace.files.length === 0,
      );
      const dependenciesChanged = await ensureDependencies(
        CONTAINER_NAME,
        workspace,
        signal,
      );
      const port =
        previewNeedsStart || dependenciesChanged
          ? await startPreview(CONTAINER_NAME, signal)
          : await waitForPreview(CONTAINER_NAME, signal);
      const logs = await readPreviewLogs(CONTAINER_NAME, signal);

      return {
        status: "ready" as const,
        previewUrl: `http://127.0.0.1:${port}`,
        revisionId: workspace.revisionId,
        logs: logs ? [logs] : [],
        diagnostics: diagnosticsFromOutput(logs),
        error: null,
      };
    }, signal);
  }

  async snapshot(projectId: string, signal?: AbortSignal) {
    return withRuntimeLock(async () => {
      const active = await inspectContainer(CONTAINER_NAME, signal);
      if (
        !active.exists ||
        !active.running ||
        active.projectId !== projectId
      ) {
        throw new Error("Project runtime is not prepared");
      }
      return readContainerSourceSnapshot(CONTAINER_NAME, signal);
    }, signal);
  }

  async replaceSource(
    projectId: string,
    revisionId: string | null,
    files: RuntimeWorkspace["files"],
    assets: RuntimeWorkspace["assets"],
    signal?: AbortSignal,
  ) {
    return withRuntimeLock(async () => {
      await ensureProjectContainer(projectId, signal);
      const previewNeedsStart = await syncWorkspace(
        CONTAINER_NAME,
        { projectId, revisionId, files, assets },
        signal,
        false,
      );
      const dependenciesChanged = await ensureDependencies(
        CONTAINER_NAME,
        { projectId, revisionId, files, assets },
        signal,
      );
      if (previewNeedsStart || dependenciesChanged) {
        await startPreview(CONTAINER_NAME, signal);
      }
    }, signal);
  }

  async runCommand(
    projectId: string,
    input: RuntimeCommandInput,
    signal?: AbortSignal,
  ) {
    return withRuntimeLock(async () => {
      await ensureProjectContainer(projectId, signal);
      const startedAt = Date.now();
      const before = await readContainerSourceSnapshot(CONTAINER_NAME, signal);
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

      const after = await readContainerSourceSnapshot(CONTAINER_NAME, signal);

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

      return {
        status: "ready" as const,
        previewUrl: `http://127.0.0.1:${port}`,
        revisionId: null,
        logs: logs ? [logs] : [],
        diagnostics: diagnosticsFromOutput(logs),
        error: null,
      };
    }, signal);
  }

  async getState(projectId: string, signal?: AbortSignal): Promise<RuntimeState> {
    const info = await inspectContainer(CONTAINER_NAME, signal);
    if (!info.exists || !info.running || info.projectId !== projectId) {
      return idleRuntimeState();
    }

    const [port, logs, previewRunning] = await Promise.all([
      publishedPort(CONTAINER_NAME, signal),
      readPreviewLogs(CONTAINER_NAME, signal),
      previewIsRunning(CONTAINER_NAME, signal),
    ]);

    const previewReady = previewRunning && (await previewResponds(port));

    return {
      status: previewReady ? "ready" : "starting",
      previewUrl: `http://127.0.0.1:${port}`,
      revisionId: null,
      logs: logs ? [logs] : [],
      diagnostics: diagnosticsFromOutput(logs),
      error: null,
    };
  }
}

export const container = new LocalContainerRuntime();
