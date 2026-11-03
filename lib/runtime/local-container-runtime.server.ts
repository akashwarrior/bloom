import "server-only";

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  PREVIEW_INSPECTOR_CONTENT,
  PREVIEW_INSPECTOR_MARKER,
  PREVIEW_INSPECTOR_PATH,
} from "@/lib/runtime/preview-inspector";
import type {
  RuntimeCommandInput,
  RuntimeState,
  RuntimeWorkspace,
} from "@/lib/runtime/protocol";
import {
  diagnosticsFromOutput,
  normalizeRuntimeOutput,
} from "@/lib/runtime/runtime-diagnostics";


const CONTAINER_NAME = "bloom-runtime";
const CONTAINER_MEMORY = "4g";
const CONTAINER_CPUS = "4";
const PREVIEW_PORT = 3000;

const NODE_IMAGE = "node:24-bookworm-slim";
const BASE_IMAGE_PACKAGES = ["git", "ca-certificates"];
const BASE_IMAGE_REPOSITORY = "bloom-nextjs-base";
const BASE_IMAGE_BUILD_VERSION = "6";
const BASE_IMAGE_HASH = createHash("sha256")
  .update(
    JSON.stringify({
      buildVersion: BASE_IMAGE_BUILD_VERSION,
      nodeImage: NODE_IMAGE,
      packages: BASE_IMAGE_PACKAGES,
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

const DEPENDENCY_MANIFESTS = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
];

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

const COMMAND_OUTPUT_LIMIT = 100_000;
const SNAPSHOT_OUTPUT_LIMIT = 32_000_000;
const MAX_SOURCE_FILE_BYTES = 1_000_000;
const MAX_SOURCE_FILES = 500;
const MAX_SOURCE_BYTES = 20_000_000;

const DEFAULT_TIMEOUT_MS = 4 * 60_000;
const PROJECT_INIT_TIMEOUT_MS = 8 * 60_000;
const PREVIEW_READY_TIMEOUT_MS = 30_000;

const INSPECTOR_DIGEST = createHash("sha256")
  .update(PREVIEW_INSPECTOR_CONTENT, "utf8")
  .digest("hex");

const PROJECT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0a0a0a"/>
  <g stroke="#ffffff" stroke-width="3.2" stroke-linecap="round">
    <line x1="16" y1="6" x2="16" y2="26"/>
    <line x1="7.3" y1="11" x2="24.7" y2="21"/>
    <line x1="24.7" y1="11" x2="7.3" y2="21"/>
  </g>
</svg>
`;


type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputTruncated: boolean;
};

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

type SyncMode = "reset" | "replace" | "overlay";
type SnapshotMode = "full" | "digest";

let runtimeQueue: Promise<void> = Promise.resolve();
let activeContainerProjectId: string | null = null;
let cachedPublishedPort: number | null = null;


const SCRIPTS = {
  processRunner: String.raw`
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
      if (logFile) { try { fs.appendFileSync(logFile, String(error?.stack || error) + "\n"); } catch {} }
      else console.error(error?.stack || error);
      cleanup();
      process.exit(1);
    });
    child.once("close", (code, signal) => {
      cleanup();
      process.exit(code ?? (signal === "SIGKILL" ? 137 : signal === "SIGTERM" ? 143 : 1));
    });
  `,

  processKiller: String.raw`
    const fs = require("node:fs");
    const [pidFile, waitMs = "0"] = process.argv.slice(1);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      let pid;
      const deadline = Date.now() + Number(waitMs);
      do {
        try {
          const val = Number(fs.readFileSync(pidFile, "utf8").trim());
          if (Number.isInteger(val) && val > 0) { pid = val; break; }
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
  `,

  workspaceSyncAndCheck: String.raw`
    const crypto = require("node:crypto");
    const fs = require("node:fs");
    const path = require("node:path");

    const [
      root,
      mode,
      templateDir,
      projectId,
      activeProjectFile,
      pidFile,
      depMarkerFile,
      ...manifests
    ] = process.argv.slice(1);

    const rootPath = path.resolve(root);
    const clear = mode !== "overlay";
    const useTemplate = mode === "reset" && fs.existsSync(templateDir);
    const payload = JSON.parse(fs.readFileSync(0, "utf8"));

    if (!Array.isArray(payload)) {
      throw new Error("Invalid workspace payload");
    }

    const fileMap = new Map();

    if (useTemplate) {
      const walkTemplate = (dir, prefix = "") => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = prefix ? prefix + "/" + entry.name : entry.name;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkTemplate(full, rel);
          } else if (entry.isFile()) {
            fileMap.set(rel, {
              path: rel,
              target: path.resolve(rootPath, rel),
              content: fs.readFileSync(full),
            });
          }
        }
      };
      walkTemplate(templateDir);
    }

    const payloadSeen = new Set();
    for (const file of payload) {
      if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
        throw new Error("Invalid workspace file");
      }
      const target = path.resolve(rootPath, file.path);
      if (target === rootPath || !target.startsWith(rootPath + path.sep)) {
        throw new Error("Invalid runtime path: " + file.path);
      }
      if (payloadSeen.has(file.path)) {
        throw new Error("Duplicate runtime path: " + file.path);
      }
      payloadSeen.add(file.path);

      fileMap.set(file.path, {
        path: file.path,
        target,
        content: Buffer.from(file.content, "base64"),
      });
    }

    const files = [...fileMap.values()];
    const seen = new Set(fileMap.keys());

    for (const file of files) {
      const segments = file.path.split("/");
      let parent = "";
      for (let i = 0; i < segments.length - 1; i += 1) {
        parent = parent ? parent + "/" + segments[i] : segments[i];
        if (seen.has(parent)) {
          throw new Error("Runtime path conflicts with file: " + parent);
        }
      }
    }

    fs.mkdirSync(rootPath, { recursive: true });

    if (clear) {
      const preserveTopLevel = new Set(["node_modules", ".next"]);
      const walkAndPrune = (dir, prefix = "") => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!prefix && preserveTopLevel.has(entry.name)) continue;
          const rel = prefix ? prefix + "/" + entry.name : entry.name;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkAndPrune(full, rel);
            try {
              if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
            } catch {}
          } else if (!seen.has(rel)) {
            fs.rmSync(full, { force: true });
          }
        }
      };
      walkAndPrune(rootPath);
    }

    for (const file of files) {
      try {
        const stat = fs.statSync(file.target, { throwIfNoEntry: false });
        if (stat?.isDirectory()) {
          fs.rmSync(file.target, { recursive: true, force: true });
        } else if (stat?.isFile()) {
          const existing = fs.readFileSync(file.target);
          if (existing.equals(file.content)) continue;
        }
      } catch {}
      fs.mkdirSync(path.dirname(file.target), { recursive: true });
      fs.writeFileSync(file.target, file.content);
    }

    if (projectId && activeProjectFile) {
      fs.writeFileSync(activeProjectFile, projectId, "utf8");
    }

    const hash = crypto.createHash("sha256");
    for (const manifest of manifests) {
      const target = path.join(rootPath, manifest);
      hash.update(manifest + "\0");
      try {
        hash.update(fs.readFileSync(target));
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
      hash.update("\0");
    }
    const digest = hash.digest("hex");
    let savedDigest = "";
    try { savedDigest = fs.readFileSync(depMarkerFile, "utf8").trim(); } catch {}
    const depsMatch = savedDigest === digest;

    let previewRunning = false;
    try {
      const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
      if (Number.isInteger(pid) && pid > 0) {
        process.kill(pid, 0);
        previewRunning = true;
      }
    } catch {}

    process.stdout.write(JSON.stringify({ previewRunning, depsMatch }));
  `,

  dependencyMarker: String.raw`
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
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
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
  `,

  sourceSnapshotReader: String.raw`
    const crypto = require("node:crypto");
    const fs = require("node:fs");
    const path = require("node:path");

    const [
      root,
      encodedExcludes,
      maxFileBytesValue,
      maxFilesValue,
      maxTotalBytesValue,
      mode = "full",
    ] = process.argv.slice(1);

    const excludes = new Set(
      JSON.parse(Buffer.from(encodedExcludes, "base64url").toString("utf8")),
    );
    const maxFileBytes = Number(maxFileBytesValue);
    const maxFiles = Number(maxFilesValue);
    const maxTotalBytes = Number(maxTotalBytesValue);
    const digestOnly = mode === "digest";
    const files = [];
    const pending = [{ directory: root, prefix: "" }];
    let totalBytes = 0;

    while (pending.length > 0) {
      const current = pending.pop();

      for (const entry of fs.readdirSync(current.directory, { withFileTypes: true })) {
        if (excludes.has(entry.name)) continue;

        const relative = current.prefix ? current.prefix + "/" + entry.name : entry.name;
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
          content: digestOnly
            ? crypto.createHash("sha256").update(content).digest("hex")
            : content.toString("base64"),
        });
      }
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    process.stdout.write(JSON.stringify(files));
  `,

  projectInitMarker: String.raw`
    const fs = require("node:fs");
    const path = require("node:path");
    const [file, action] = process.argv.slice(1);
    if (action === "write") {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "initialized\n", "utf8");
    } else {
      process.exit(fs.existsSync(file) ? 0 : 1);
    }
  `,

  projectMover: String.raw`
    const fs = require("node:fs");
    const path = require("node:path");
    const [root, name] = process.argv.slice(1);
    const source = path.join(root, name);
    if (!fs.existsSync(source)) {
      throw new Error("The generated project scaffold was not found at " + source);
    }
    for (const entry of fs.readdirSync(source)) {
      fs.renameSync(path.join(source, entry), path.join(root, entry));
    }
    fs.rmSync(source, { recursive: true, force: true });
  `,

  copyTemplate: String.raw`
    const fs = require("node:fs");
    const path = require("node:path");
    const [src, dest] = process.argv.slice(1);
    const excludes = new Set(["node_modules", ".next", ".git"]);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (excludes.has(entry)) continue;
      fs.cpSync(path.join(src, entry), path.join(dest, entry), { recursive: true });
    }
  `,

  warmupNext: String.raw`
    const { spawn } = require("node:child_process");
    const fs = require("node:fs");
    const path = require("node:path");

    const [workspaceDir, portStr] = process.argv.slice(1);
    const port = Number(portStr) || 3000;
    const nextBin = path.join(workspaceDir, "node_modules/next/dist/bin/next");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      const child = spawn(
        process.execPath,
        [nextBin, "dev", "--turbopack", "--hostname", "127.0.0.1", "--port", String(port)],
        {
          cwd: workspaceDir,
          detached: true,
          stdio: "ignore",
          env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
        }
      );

      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        try {
          const res = await fetch("http://127.0.0.1:" + port, {
            signal: AbortSignal.timeout(15_000),
          });
          await res.body?.cancel();
          if (res.status > 0) break;
        } catch {}
        await sleep(300);
      }

      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      await sleep(500);
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
      try {
        fs.rmSync(path.join(workspaceDir, ".next/dev/lock"), { force: true });
      } catch {}
    })();
  `,
};


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

  const init = pnpmCommand([
    "dlx",
    "shadcn@latest",
    "init",
    "-d",
    "--name",
    PROJECT_SCAFFOLD_DIR,
  ]);
  const initialized = await containerCommand(
    name,
    [init.executable, ...init.args],
    signal,
    PROJECT_INIT_TIMEOUT_MS,
    WORKSPACE_DIR,
  );
  if (initialized.exitCode !== 0) {
    throw dockerError("Creating the project with shadcn", initialized);
  }

  const components = pnpmCommand([
    "exec",
    "shadcn",
    "add",
    "--all",
    "--yes",
    "--overwrite",
  ]);
  const added = await containerCommand(
    name,
    [components.executable, ...components.args],
    signal,
    PROJECT_INIT_TIMEOUT_MS,
    source,
  );
  if (added.exitCode !== 0) {
    throw dockerError("Adding shadcn components", added);
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
    ],
    "overlay",
    signal,
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
      "[bloom-runtime] Step 2/5: Scaffolding Next.js & installing shadcn components...",
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
): Promise<{ previewRunning: boolean; depsMatch: boolean }> {
  const payload = JSON.stringify(
    files.map((file) => ({
      path: file.path,
      content:
        file.encoding === "base64"
          ? file.content
          : Buffer.from(file.content, "utf8").toString("base64"),
    })),
  );

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
    { signal, timeoutMs: 60_000, stdin: payload },
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
): Promise<{ previewNeedsStart: boolean }> {
  const isFreshEmpty =
    workspace.revisionId === null && workspace.files.length === 0;
  const inspector = workspace.files.some(
    (file) => file.path === PREVIEW_INSPECTOR_PATH,
  )
    ? []
    : [{ path: PREVIEW_INSPECTOR_PATH, content: PREVIEW_INSPECTOR_CONTENT }];

  const mode: SyncMode = isFreshEmpty || switchedProject ? "reset" : "replace";

  const { previewRunning, depsMatch } = await syncAndCheckWorkspace(
    name,
    workspace.projectId,
    [...workspace.files, ...(workspace.assets ?? []), ...inspector],
    mode,
    signal,
  );

  let dependenciesChanged = false;
  if (
    workspace.files.some((file) => file.path === "package.json") &&
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

async function readContainerSourceSnapshot(
  name: string,
  signal?: AbortSignal,
  mode: SnapshotMode = "full",
) {
  const encodedExcludes = Buffer.from(
    JSON.stringify(SNAPSHOT_EXCLUDES),
    "utf8",
  ).toString("base64url");

  const result = await execNode(
    name,
    SCRIPTS.sourceSnapshotReader,
    [
      WORKSPACE_DIR,
      encodedExcludes,
      String(MAX_SOURCE_FILE_BYTES),
      String(MAX_SOURCE_FILES),
      String(MAX_SOURCE_BYTES),
      mode,
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
    files = JSON.parse(result.stdout) as Array<{ path: string; content: string }>;
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

    if (mode === "digest") {
      return file.path === PREVIEW_INSPECTOR_PATH &&
        file.content === INSPECTOR_DIGEST
        ? []
        : [{ path: file.path, content: file.content }];
    }

    const content = Buffer.from(file.content, "base64").toString("utf8");
    return file.path === PREVIEW_INSPECTOR_PATH &&
      content.startsWith(PREVIEW_INSPECTOR_MARKER)
      ? []
      : [{ path: file.path, content }];
  });
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
  status: "ready" | "starting",
  port: number,
  revisionId: string | null,
  logs: string,
): RuntimeState {
  return {
    status,
    previewUrl: `http://127.0.0.1:${port}`,
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
      const port = previewNeedsStart
        ? await startPreview(CONTAINER_NAME, signal)
        : await waitForPreview(CONTAINER_NAME, signal);
      const logs = await readPreviewLogs(CONTAINER_NAME, signal);

      return buildRuntimeState("ready", port, workspace.revisionId, logs);
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
      return readContainerSourceSnapshot(CONTAINER_NAME, signal, "full");
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
      const { switchedProject } = await ensureProjectContainer(
        projectId,
        signal,
      );
      const { previewNeedsStart } = await syncWorkspaceAndDeps(
        CONTAINER_NAME,
        { projectId, revisionId, files, assets },
        switchedProject,
        signal,
      );
      if (previewNeedsStart) {
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

  async getState(projectId: string, signal?: AbortSignal): Promise<RuntimeState> {
    const info = await inspectContainer(CONTAINER_NAME, signal);
    if (!info.exists || !info.running || info.projectId !== projectId) {
      return idleRuntimeState();
    }

    const [port, logs] = await Promise.all([
      publishedPort(CONTAINER_NAME, signal),
      readPreviewLogs(CONTAINER_NAME, signal),
    ]);

    const previewReady =
      (await previewResponds(port, 2_000, signal)) ||
      ((await previewIsRunning(CONTAINER_NAME, signal)) &&
        (await previewResponds(port, 2_000, signal)));

    return buildRuntimeState(
      previewReady ? "ready" : "starting",
      port,
      null,
      logs,
    );
  }
}

export const container = new LocalContainerRuntime();
