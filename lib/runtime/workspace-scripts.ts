export const SCRIPTS = {
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
    const deleted = [];
    for (const file of payload) {
      if (!file || typeof file.path !== "string" || typeof file.content !== "string" && file.remove !== true) {
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
      if (file.remove) {
        if (clear) throw new Error("Explicit deletion requires overlay mode");
        deleted.push(target);
        continue;
      }

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

    if (!clear) {
      // A source patch must never replace an unrelated directory or follow links.
      const verify = (target) => {
        let current = target;
        while (current !== rootPath) {
          const stat = fs.lstatSync(current, { throwIfNoEntry: false });
          if (stat?.isSymbolicLink() || (current === target && stat?.isDirectory())) {
            throw new Error("Workspace patch conflicts with " + current);
          }
          current = path.dirname(current);
        }
      };
      for (const target of [...deleted, ...files.map((file) => file.target)]) verify(target);
      for (const target of deleted) fs.rmSync(target, { force: true });
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
      encodedFilter,
    ] = process.argv.slice(1);

    const excludes = new Set(
      JSON.parse(Buffer.from(encodedExcludes, "base64url").toString("utf8")),
    );
    const maxFileBytes = Number(maxFileBytesValue);
    const maxFiles = Number(maxFilesValue);
    const maxTotalBytes = Number(maxTotalBytesValue);
    const digestOnly = mode === "digest";
    const metadataOnly = mode === "metadata";
    const strict = mode === "capture";
    const { paths, globs, search } = JSON.parse(Buffer.from(encodedFilter, "base64url").toString("utf8"));
    const requested = paths && new Set(paths);
    const utf8 = new TextDecoder("utf-8", { fatal: true });
    const hashBuffer = digestOnly ? Buffer.alloc(65_536) : null;
    function hashFile(file) {
      const hash = crypto.createHash("sha256");
      const fd = fs.openSync(file, "r");
      try {
        let bytes;
        while ((bytes = fs.readSync(fd, hashBuffer, 0, hashBuffer.length, null)) > 0) {
          hash.update(hashBuffer.subarray(0, bytes));
        }
      } finally {
        fs.closeSync(fd);
      }
      return hash.digest("hex");
    }
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
        if (requested && !requested.has(relative)) continue;
        if (globs && !globs.some((glob) => path.matchesGlob(relative, glob))) continue;
        if (!entry.isFile()) {
          if (strict) throw new Error("Unsupported source file: " + relative);
          if (digestOnly) {
            if (files.length >= maxFiles) throw new Error("Project exceeds the source snapshot file limit");
            const target = entry.isSymbolicLink() ? fs.readlinkSync(absolute) : "";
            const kind = entry.isSymbolicLink() ? "symlink" : "unsupported";
            files.push({
              path: relative,
              content: kind + ":" + crypto.createHash("sha256").update(target).digest("hex"),
            });
          }
          continue;
        }

        const info = fs.statSync(absolute);
        if (info.size > maxFileBytes && !digestOnly && !metadataOnly) {
          if (strict) throw new Error("File exceeds the source size limit: " + relative);
          continue;
        }

        const content = metadataOnly || digestOnly ? null : fs.readFileSync(absolute);
        let binary = false;
        if (content && !digestOnly) {
          try {
            utf8.decode(content);
            binary = content.includes(0);
          } catch {
            binary = true;
          }
          if (binary && !strict) continue;
        }

        if (strict || mode === "full" || mode === "search") totalBytes += info.size;
        if (totalBytes > maxTotalBytes) {
          throw new Error("Project exceeds the source snapshot size limit");
        }
        if (files.length >= maxFiles) {
          throw new Error("Project exceeds the source snapshot file limit");
        }

        files.push({
          path: relative,
          size: info.size,
          binary,
          content: metadataOnly ? "" : digestOnly
            ? hashFile(absolute)
            : content.toString(search ? "utf8" : "base64"),
        });
      }
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    if (!search) {
      process.stdout.write(JSON.stringify(files));
    } else {
      const expression = search.mode === "regex" ? new RegExp(search.query, search.caseSensitive ? "" : "i") : null;
      const needle = search.caseSensitive ? search.query : search.query.toLowerCase();
      const matches = [];
      let searchedFiles = 0;
      let truncated = false;
      scan: for (const { path, content } of files) {
        searchedFiles++;
        const lines = content.split("\n");
        for (let index = 0; index < lines.length; index++) {
          const line = lines[index];
          if (expression && line.length > 20_000) {
            truncated = true;
            continue;
          }
          const column = expression
            ? (expression.exec(line)?.index ?? -1)
            : (search.caseSensitive ? line : line.toLowerCase()).indexOf(needle);
          if (column < 0) continue;
          matches.push({
            path, line: index + 1, column: column + 1,
            preview: lines.slice(Math.max(0, index - search.contextLines), index + search.contextLines + 1)
              .join("\n").slice(0, 4_000),
          });
          if (matches.length >= search.maxResults) {
            truncated = true;
            break scan;
          }
        }
      }
      process.stdout.write(JSON.stringify({ matches, searchedFiles, truncated }));
    }
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
