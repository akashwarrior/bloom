#!/usr/bin/env node
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { capture } from "./capture.mjs";
import { PROMPTS } from "./prompts.mjs";

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(BENCH_DIR, "..");
const RUNS_DIR = path.join(BENCH_DIR, ".runs");
const DEFAULT_OUT = path.join(ROOT, "benchmark-results", "bloom");
const requireFromRoot = createRequire(path.join(ROOT, "package.json"));
const puppeteer = requireFromRoot("puppeteer-core");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const ORIGIN = args.origin ?? null;
const CONTAINER = args.container ?? null;
const APP_DIR = args["app-dir"] ? path.resolve(args["app-dir"]) : null;
const OUT = path.resolve(args.out ?? DEFAULT_OUT);
const ONLY = (args.only ?? "")
  .split(",")
  .map((value) => Number(value))
  .filter((value) => Number.isInteger(value) && value > 0);
const FORCE = args.force === "true";
const WORKERS = Math.max(1, Number(args.workers ?? 1) || 1);
const KEEP = args.keep === "true";
const CAPTURE_PROJECT = args.capture ?? null;
const CAPTURE_REVISION = args.revision ?? null;
const CAPTURE_INDEX = Number(args.index ?? 1);
const RUN_ID =
  args["run-id"] ?? `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;

const EMAIL = args.email ?? "bench@bloom.local";
const PASSWORD = "bench-password-123";

const COPY_EXCLUDES = [
  ".git/",
  "node_modules/",
  ".next/",
  "logs/",
  "benchmark/",
  "benchmark-results/",
  "coverage/",
  ".cache/",
  ".turbo/",
  "dist/",
  "build/",
  "out/",
  ".data/",
  "public/bloom-generated-assets/",
];

function log(message) {
  console.log(`[bench ${new Date().toISOString().slice(11, 19)}] ${message}`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function dockerRm(name) {
  if (!name) return;
  try {
    execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  } catch {}
}

async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("Unable to allocate a local port"));
      });
    });
  });
}

function upsertEnv(content, key, value) {
  const lines = content.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  return `${next.join("\n").replace(/\n+$/, "")}\n`;
}

async function copyWorkingTree(appDir) {
  await fs.mkdir(appDir, { recursive: true });
  const excludeArgs = COPY_EXCLUDES.flatMap((entry) => ["--exclude", entry]);
  run("rsync", ["-a", "--delete", ...excludeArgs, `${ROOT}/`, `${appDir}/`]);

  const modules = path.join(appDir, "node_modules");
  await fs.rm(modules, { recursive: true, force: true });
  await fs.symlink(path.join(ROOT, "node_modules"), modules, "dir");
  await fs.mkdir(path.join(appDir, "logs"), { recursive: true });
}

async function checkWorkerRedis() {
  let url = process.env.REDIS_URL;
  if (url === undefined) {
    for (const name of [".env.local", ".env"]) {
      const filename = path.join(ROOT, name);
      if (!(await exists(filename))) continue;
      url = parseEnv(await fs.readFile(filename, "utf8")).REDIS_URL;
      if (url !== undefined) break;
    }
  }

  if (!url) throw new Error("Set REDIS_URL in .env.local or in the shell before running the benchmark.");
  const { createClient } = requireFromRoot("redis");
  let client;
  try {
    client = createClient({
      url,
      socket: { connectTimeout: 3000, reconnectStrategy: false },
    });
    client.on("error", () => {});
    await client.connect();
    await client.ping();
  } catch {
    throw new Error("Could not connect to Redis for chat streaming. Check REDIS_URL and start Redis.");
  } finally {
    if (client?.isOpen) await client.disconnect().catch(() => {});
  }
}

async function writeWorkerEnv(appDir, origin, container) {
  for (const name of [".env", ".env.local"]) {
    const source = path.join(ROOT, name);
    if (await exists(source)) {
      await fs.copyFile(source, path.join(appDir, name));
    }
  }

  const envLocalPath = path.join(appDir, ".env.local");
  let content = "";
  try {
    content = await fs.readFile(envLocalPath, "utf8");
  } catch {}
  content = upsertEnv(content, "BETTER_AUTH_URL", origin);
  content = upsertEnv(content, "BLOOM_RUNTIME_CONTAINER", container);
  await fs.writeFile(envLocalPath, content, "utf8");
}

async function waitForServer(worker, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "no response";
  while (Date.now() < deadline) {
    if (worker.child.exitCode !== null) {
      throw new Error(
        `Next dev exited before becoming ready (code ${worker.child.exitCode}); see ${path.join(worker.dir, "dev.log")}`,
      );
    }
    try {
      const response = await fetch(`${worker.origin}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
      lastStatus = `HTTP ${response.status}`;
      if (response.status < 500) {
        log(`worker ${worker.id} ready at ${worker.origin} (${lastStatus})`);
        return;
      }
    } catch (error) {
      lastStatus = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `Worker ${worker.id} did not become ready: ${lastStatus}; see ${path.join(worker.dir, "dev.log")}`,
  );
}

async function startWorker(id) {
  const dir = path.join(RUNS_DIR, `worker-${id}`);
  const appDir = path.join(dir, "app");
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(appDir, { recursive: true });
  log(`worker ${id}: copying current working tree into ${path.relative(ROOT, appDir)}`);
  await copyWorkingTree(appDir);

  const port = await findFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const container = `bloom-bench-${RUN_ID}-${id}`;
  await writeWorkerEnv(appDir, origin, container);
  dockerRm(container);

  const devLog = path.join(dir, "dev.log");
  const logFd = await fs.open(devLog, "a");
  const nextBin = path.join(ROOT, "node_modules", ".bin", "next");
  const child = spawn(nextBin, ["dev", "-p", String(port)], {
    cwd: appDir,
    detached: true,
    env: {
      ...process.env,
      BETTER_AUTH_URL: origin,
      BLOOM_RUNTIME_CONTAINER: container,
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", logFd.fd, logFd.fd],
  });
  await logFd.close();

  const worker = {
    id,
    dir,
    appDir,
    port,
    origin,
    container,
    child,
    devLog,
    external: false,
  };
  activeWorkers.add(worker);
  try {
    await waitForServer(worker);
  } catch (error) {
    await stopWorker(worker);
    throw error;
  }
  return worker;
}

function externalWorker() {
  if (!ORIGIN) throw new Error("External mode requires --origin");
  return {
    id: "external",
    dir: null,
    appDir: APP_DIR ?? ROOT,
    port: null,
    origin: ORIGIN,
    container: CONTAINER,
    child: null,
    devLog: null,
    external: true,
  };
}

async function stopWorker(worker) {
  if (!worker || worker.external) return;
  activeWorkers.delete(worker);
  if (worker.child && worker.child.exitCode === null) {
    try {
      process.kill(-worker.child.pid, "SIGTERM");
    } catch {
      try {
        worker.child.kill("SIGTERM");
      } catch {}
    }
    const deadline = Date.now() + 6_000;
    while (worker.child.exitCode === null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (worker.child.exitCode === null) {
      try {
        process.kill(-worker.child.pid, "SIGKILL");
      } catch {
        try {
          worker.child.kill("SIGKILL");
        } catch {}
      }
    }
  }
  dockerRm(worker.container);
  if (!KEEP) {
    await fs.rm(worker.dir, { recursive: true, force: true }).catch(() => undefined);
  } else {
    log(`worker ${worker.id}: kept ${path.relative(ROOT, worker.dir)}`);
  }
}

const activeWorkers = new Set();

class ApiClient {
  constructor(origin) {
    this.origin = origin;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  absorb(response) {
    const values = response.headers.getSetCookie?.() ?? [];
    for (const value of values) {
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  async api(pathname, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", this.origin);
    if (init.body) headers.set("content-type", "application/json");
    if (this.cookies.size > 0) headers.set("cookie", this.cookieHeader());
    const response = await fetch(`${this.origin}${pathname}`, {
      ...init,
      headers,
      redirect: "manual",
    });
    this.absorb(response);
    return response;
  }

  async authenticate() {
    const signIn = await this.api("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (signIn.ok) return;

    const signUp = await this.api("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        name: "Bench",
      }),
    });
    if (!signUp.ok) {
      throw new Error(
        `Authentication failed: sign-in ${signIn.status}, sign-up ${signUp.status}: ${await signUp.text()}`,
      );
    }
  }

  async createProject(title) {
    const response = await this.api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      throw new Error(
        `Project creation failed (${response.status}): ${await response.text()}`,
      );
    }
    return response.json();
  }

  async prepareRuntime(projectId) {
    const response = await this.api(`/api/projects/${projectId}/runtime/prepare`, {
      method: "POST",
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Runtime prepare failed (${response.status}): ${text.slice(0, 500)}`,
      );
    }
    const state = JSON.parse(text);
    if (!state.previewUrl) {
      throw new Error(
        `Runtime prepare returned no preview: ${text.slice(0, 500)}`,
      );
    }
    return state;
  }

  postStream(pathname, bodyString) {
    return new Promise((resolve, reject) => {
      const url = new URL(pathname, this.origin);
      const request = http.request(
        {
          hostname: url.hostname,
          port: url.port || 80,
          path: `${url.pathname}${url.search}`,
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: this.origin,
            cookie: this.cookieHeader(),
            accept: "text/event-stream",
            "content-length": Buffer.byteLength(bodyString),
          },
        },
        resolve,
      );
      request.setTimeout(0);
      request.on("socket", (socket) => socket.setTimeout(0));
      request.on("error", reject);
      request.end(bodyString);
    });
  }

  async sendPrompt(projectId, prompt, logFile) {
    const body = {
      requestId: crypto.randomUUID(),
      submission: {
        trigger: "submit-message",
        message: {
          id: crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text: prompt }],
        },
      },
    };

    const startedAt = Date.now();
    const response = await this.postStream(
      `/api/projects/${projectId}/chat`,
      JSON.stringify(body),
    );
    const status = response.statusCode ?? 0;
    if (status !== 200) {
      const chunks = [];
      for await (const chunk of response) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString("utf8");
      await fs.appendFile(logFile, `HTTP ${status}: ${text}\n`);
      throw new Error(
        `Chat request failed (${status}): ${text.slice(0, 500)}`,
      );
    }

    let characters = 0;
    let chunks = 0;
    let tail = "";
    for await (const chunk of response) {
      const text = chunk.toString("utf8");
      characters += text.length;
      chunks += 1;
      tail = (tail + text).slice(-4_000);
      if (chunks % 200 === 0) await fs.appendFile(logFile, ".");
    }
    await fs.appendFile(
      logFile,
      `\nstream ended: ${characters} chars in ${Math.round((Date.now() - startedAt) / 1_000)}s\n`,
    );
    if (!tail.includes('"type":"finish"') && !tail.includes('"finishReason"')) {
      await fs.appendFile(logFile, `stream tail: ${tail.slice(-1_500)}\n`);
    }
    return { characters, durationMs: Date.now() - startedAt };
  }
}

async function waitForPersist(worker, projectId, logFile, timeoutMs = 20 * 60_000) {
  const logRoot = path.join(worker.appDir, "logs", projectId);
  const startedAt = Date.now();
  let lastEvent = "no trace yet";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const entries = (await fs.readdir(logRoot))
        .filter((entry) => entry.endsWith(".jsonl"))
        .sort();
      for (const entry of entries.reverse()) {
        const text = await fs.readFile(path.join(logRoot, entry), "utf8");
        if (text.includes('"response.persisted"')) {
          const seconds = Math.round((Date.now() - startedAt) / 1_000);
          await fs.appendFile(logFile, `response persisted after ${seconds}s wait\n`);
          return { persisted: true, seconds };
        }
        const lines = text.trim().split("\n");
        for (let index = lines.length - 1; index >= 0; index -= 1) {
          try {
            const event = JSON.parse(lines[index]);
            lastEvent = event.event ?? lastEvent;
            if (
              lastEvent === "design_agent.failed" ||
              lastEvent === "generation.prepare_error"
            ) {
              await fs.appendFile(
                logFile,
                `generation failed before persistence (${lastEvent})\n`,
              );
              throw new Error(`Generation failed before persistence: ${lastEvent}`);
            }
            if (lastEvent) break;
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("Generation failed")) {
              throw error;
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Generation failed")) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  await fs.appendFile(
    logFile,
    `persist wait timed out (last event: ${lastEvent})\n`,
  );
  throw new Error(
    `Response was not persisted within ${Math.round(timeoutMs / 60_000)} minutes`,
  );
}

async function waitForPreview(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Preview did not become ready: ${lastError}`);
}

async function saveWorkspace(worker, projectId, directory) {
  if (worker.container) {
    try {
      const archive = execFileSync(
        "docker",
        [
          "exec",
          worker.container,
          "tar",
          "-czf",
          "-",
          "-C",
          "/workspace",
          "app",
          "components",
          "lib",
          "DESIGN.md",
        ],
        { maxBuffer: 200 * 1024 * 1024 },
      );
      await fs.writeFile(path.join(directory, "source.tar.gz"), archive);
    } catch (error) {
      await fs.appendFile(
        path.join(directory, "errors.txt"),
        `source archive: ${error}\n`,
      );
    }

    try {
      const design = execFileSync(
        "docker",
        ["exec", worker.container, "cat", "/workspace/DESIGN.md"],
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      );
      await fs.writeFile(path.join(directory, "DESIGN.md"), design);
    } catch (error) {
      await fs.appendFile(
        path.join(directory, "errors.txt"),
        `DESIGN.md: ${error}\n`,
      );
    }
  }

  const logRoot = path.join(worker.appDir, "logs", projectId);
  try {
    const entries = await fs.readdir(logRoot);
    const logDirectory = path.join(directory, "logs");
    await fs.mkdir(logDirectory, { recursive: true });
    for (const entry of entries) {
      await fs.copyFile(path.join(logRoot, entry), path.join(logDirectory, entry));
    }
  } catch (error) {
    await fs.appendFile(
      path.join(directory, "errors.txt"),
      `logs: ${error}\n`,
    );
  }
}

async function runPrompt(worker, prompt, index) {
  const directory = path.join(OUT, `${String(index).padStart(2, "0")}-${prompt.slug}`);
  const metricsPath = path.join(directory, "metrics.json");
  if (!FORCE) {
    try {
      await fs.access(metricsPath);
      log(`skip ${prompt.slug} (already complete)`);
      return JSON.parse(await fs.readFile(metricsPath, "utf8"));
    } catch {}
  }

  await fs.mkdir(directory, { recursive: true });
  const logFile = path.join(directory, "run.log");
  await fs.writeFile(logFile, `${new Date().toISOString()} ${prompt.prompt}\n`);

  const client = new ApiClient(worker.origin);
  await client.authenticate();
  const project = await client.createProject(prompt.title);
  await fs.appendFile(logFile, `project ${project.id}\n`);
  log(`start ${prompt.slug} project=${project.id} worker=${worker.id}`);

  const generation = await client.sendPrompt(project.id, prompt.prompt, logFile);
  const persist = await waitForPersist(worker, project.id, logFile);
  const state = await client.prepareRuntime(project.id);
  const url = state.previewUrl;
  await fs.appendFile(logFile, `preview ${url} status=${state.status}\n`);
  await waitForPreview(url);
  const screenshots = await capture(browser, url, directory);
  await saveWorkspace(worker, project.id, directory);

  const metrics = {
    slug: prompt.slug,
    title: prompt.title,
    prompt: prompt.prompt,
    projectId: project.id,
    previewUrl: url,
    worker: worker.id,
    container: worker.container,
    finishedAt: new Date().toISOString(),
    generation: { ...generation, persistWaitSeconds: persist.seconds },
    screenshots,
  };
  await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2));
  log(
    `done ${prompt.slug} in ${Math.round(generation.durationMs / 1_000)}s ` +
      `images=${screenshots.desktop.images.loaded}/${screenshots.desktop.images.total}`,
  );
  return metrics;
}

async function captureProject(worker, projectId, prompt, index) {
  const directory = path.join(OUT, `${String(index).padStart(2, "0")}-${prompt.slug}`);
  await fs.mkdir(directory, { recursive: true });
  const logFile = path.join(directory, "run.log");
  await fs.appendFile(
    logFile,
    `\n${new Date().toISOString()} capture project=${projectId}` +
      `${CAPTURE_REVISION ? ` revision=${CAPTURE_REVISION}` : ""}\n`,
  );

  const client = new ApiClient(worker.origin);
  await client.authenticate();

  if (CAPTURE_REVISION) {
    const restore = await client.api(
      `/api/projects/${projectId}/revisions/${CAPTURE_REVISION}/restore`,
      { method: "POST" },
    );
    const text = await restore.text();
    await fs.appendFile(logFile, `restore ${restore.status}: ${text.slice(0, 300)}\n`);
    if (!restore.ok) {
      throw new Error(
        `Revision restore failed (${restore.status}): ${text.slice(0, 300)}`,
      );
    }
  }

  const state = await client.prepareRuntime(projectId);
  const url = state.previewUrl;
  await fs.appendFile(logFile, `preview ${url} status=${state.status}\n`);
  await waitForPreview(url);
  const screenshots = await capture(browser, url, directory);
  await saveWorkspace(worker, projectId, directory);

  let prior = {};
  try {
    prior = JSON.parse(await fs.readFile(path.join(directory, "metrics.json"), "utf8"));
  } catch {}

  const metrics = {
    ...prior,
    slug: prompt.slug,
    title: prompt.title,
    prompt: prompt.prompt,
    projectId,
    revisionId: CAPTURE_REVISION ?? prior.revisionId ?? null,
    previewUrl: url,
    worker: worker.id,
    container: worker.container,
    finishedAt: new Date().toISOString(),
    captureOnly: true,
    screenshots,
  };
  await fs.writeFile(
    path.join(directory, "metrics.json"),
    JSON.stringify(metrics, null, 2),
  );
  log(`captured ${prompt.slug} ${url}`);
  return metrics;
}

function selectedPrompts() {
  if (args.prompt && args.prompt !== "true") {
    const slugs = (args.slug ?? "").split(",").filter(Boolean);
    return args.prompt.split("||").map((prompt, index) => ({
      prompt: { slug: slugs[index] ?? `custom${index ? `-${index + 1}` : ""}`, title: "Custom prompt", prompt: prompt.trim() },
      index: PROMPTS.length + 1 + index,
    }));
  }
  return PROMPTS.map((prompt, index) => ({
    prompt,
    index: index + 1,
  })).filter(({ index }) => ONLY.length === 0 || ONLY.includes(index));
}

async function main() {
  if (args.list === "true") {
    for (const [index, prompt] of PROMPTS.entries()) {
      console.log(`${index + 1}\t${prompt.slug}\t${prompt.prompt}`);
    }
    return;
  }
  if (args.help === "true") {
    console.log(`Usage: node benchmark/bench.mjs [options]

Options:
  --only=1,5         Run only the selected prompt numbers (default: all)
  --workers=1        Number of isolated app copies/containers to run concurrently
  --force=true       Re-run prompts even when metrics.json exists
  --keep=true        Keep benchmark/.runs worker directories after exit
  --out=<dir>        Results directory (default: benchmark-results/bloom)
  --list             List prompt numbers and slugs
  --capture=<id>     Capture an existing project instead of generating
  --revision=<id>    Restore a project revision before capture
  --index=<n>        Prompt number to use with --capture (default: 1)
  --origin=<url>     Use an existing app instead of provisioning workers
  --container=<name> Container used by the existing app
  --app-dir=<dir>    App directory used by the existing app (for logs)
`);
    return;
  }

  if (!ORIGIN && !args.capture) await checkWorkerRedis();

  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(RUNS_DIR, { recursive: true });

  const prompts = selectedPrompts();
  if (prompts.length === 0) throw new Error("No prompts selected");

  let workers;
  if (ORIGIN) {
    workers = [externalWorker()];
  } else {
    const count = Math.min(WORKERS, prompts.length);
    log(`provisioning ${count} isolated worker(s) from ${ROOT}`);
    workers = [];
    try {
      for (let index = 0; index < count; index += 1) {
        workers.push(await startWorker(String.fromCharCode(97 + index)));
      }
    } catch (error) {
      await Promise.all(workers.map((worker) => stopWorker(worker)));
      throw error;
    }
  }

  const summary = [];
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH ?? "/usr/lib/chromium/chromium",
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
    });

    if (CAPTURE_PROJECT) {
      const index = Number.isInteger(CAPTURE_INDEX) && CAPTURE_INDEX > 0 ? CAPTURE_INDEX : 1;
      const prompt = PROMPTS[index - 1] ?? PROMPTS[0];
      summary.push(
        await captureProject(workers[0], CAPTURE_PROJECT, prompt, index),
      );
    } else {
      let next = 0;
      const drain = async (worker) => {
        while (next < prompts.length) {
          const item = prompts[next];
          next += 1;
          try {
            summary.push(await runPrompt(worker, item.prompt, item.index));
          } catch (error) {
            const directory = path.join(
              OUT,
              `${String(item.index).padStart(2, "0")}-${item.prompt.slug}`,
            );
            await fs.mkdir(directory, { recursive: true });
            await fs.appendFile(
              path.join(directory, "errors.txt"),
              `${error?.stack ?? error}\n`,
            );
            log(`failed ${item.prompt.slug}: ${error}`);
            summary.push({ slug: item.prompt.slug, error: String(error) });
          }
        }
      };
      await Promise.all(workers.map(drain));
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    browser = null;
    for (const worker of workers) {
      await stopWorker(worker);
    }
  }

  if (summary.length > 0) {
    const summaryPath = path.join(OUT, `summary-${Date.now()}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    log(`summary ${path.relative(ROOT, summaryPath)}`);
  }
}

let browser = null;
let shuttingDown = false;

function forceStopWorker(worker) {
  if (!worker || worker.external) return;
  if (worker.child?.pid) {
    try {
      process.kill(-worker.child.pid, "SIGKILL");
    } catch {
      try {
        worker.child.kill("SIGKILL");
      } catch {}
    }
  }
  dockerRm(worker.container);
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}; cleaning up`);
  // Cleanup must be synchronous here: an interrupted generation may leave the
  // child dev server in its own process group, and awaiting it can stall exit.
  try {
    browser?.process()?.kill("SIGKILL");
  } catch {}
  for (const worker of activeWorkers) forceStopWorker(worker);
  activeWorkers.clear();
  process.exit(signal === "SIGINT" ? 130 : 143);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await main();
