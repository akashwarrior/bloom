import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SCRIPTS } from "../lib/runtime/workspace-scripts.ts";

function snapshot(dir: string, mode: string, filter = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return spawnSync(process.execPath, [
    "-e", SCRIPTS.sourceSnapshotReader,
    dir, encode([]), "64", "20", "10000", mode, encode(filter),
  ], { encoding: "utf-8" });
}

test("a workspace overlay preserves untouched binary and oversized files", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "bloom-workspace-"));
  t.after(() => rmSync(dir, { recursive: true }));
  const binary = Buffer.from([0, 1, 0xff]);
  const oversized = Buffer.alloc(65, 0x41);
  writeFileSync(join(dir, "binary.bin"), binary);
  writeFileSync(join(dir, "large.txt"), oversized);
  writeFileSync(join(dir, "old.ts"), "old");
  writeFileSync(join(dir, "page.tsx"), "previous");

  const result = spawnSync(process.execPath, [
    "-e", SCRIPTS.workspaceSyncAndCheck, dir, "overlay", "",
    "", "", join(dir, "preview.pid"), join(dir, "deps"),
  ], {
    input: JSON.stringify([
      { path: "page.tsx", content: Buffer.from("updated").toString("base64") },
      { path: "old.ts", remove: true },
    ]),
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(dir, "page.tsx"), "utf-8"), "updated");
  assert.throws(() => readFileSync(join(dir, "old.ts")), { code: "ENOENT" });
  assert.deepEqual(readFileSync(join(dir, "binary.bin")), binary);
  assert.deepEqual(readFileSync(join(dir, "large.txt")), oversized);
  assert.match(snapshot(dir, "capture").stderr, /File exceeds the source size limit: large.txt/);

  const captured = snapshot(dir, "capture", { paths: ["binary.bin"] });
  assert.equal(captured.status, 0, captured.stderr);
  assert.deepEqual(JSON.parse(captured.stdout), [{
    path: "binary.bin", size: binary.length, binary: true, content: binary.toString("base64"),
  }]);

  const listing = snapshot(dir, "metadata");
  assert.equal(listing.status, 0, listing.stderr);
  const entries = JSON.parse(listing.stdout) as { path: string; size: number; content: string }[];
  assert.deepEqual(entries.map(({ path, size, content }) => [path, size, content]), [
    ["binary.bin", 3, ""], ["large.txt", 65, ""], ["page.tsx", 7, ""],
  ]);
});

test("runtime search returns bounded matching lines rather than source files", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "bloom-search-"));
  t.after(() => rmSync(dir, { recursive: true }));
  writeFileSync(join(dir, "a.ts"), "unrelated\nconst item = 1;\nconst item = 2;");
  writeFileSync(join(dir, "ignored.ts"), "const item = 3;");
  const result = snapshot(dir, "search", {
    paths: ["a.ts"],
    search: { mode: "regex", query: "^const item", contextLines: 0, maxResults: 1 },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    matches: [{ path: "a.ts", line: 2, column: 1, preview: "const item = 1;" }],
    searchedFiles: 1,
    truncated: true,
  });
});

test("command digests track symlinks without following them and capture rejects them", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "bloom-digest-"));
  t.after(() => rmSync(dir, { recursive: true }));
  symlinkSync("/a/missing/target", join(dir, "link.ts"));

  const before = snapshot(dir, "digest");
  assert.equal(before.status, 0, before.stderr);
  assert.match(before.stdout, /"path":"link.ts","content":"symlink:[0-9a-f]{64}"/);
  assert.match(snapshot(dir, "capture").stderr, /Unsupported source file: link.ts/);

  rmSync(join(dir, "link.ts"));
  const after = snapshot(dir, "digest");
  assert.equal(after.status, 0, after.stderr);
  assert.deepEqual(JSON.parse(after.stdout), []);
});

test("targeted source batches can create new files and delete their last tracked path", () => {
  const moduleUrl = new URL("../lib/runtime/source-files.server.ts", import.meta.url);
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--input-type=module", "--eval", `
      import assert from "node:assert/strict";
      import { SourceFiles } from ${JSON.stringify(moduleUrl.href)};

      const paths = ["DESIGN.md", ".bloom/design.json"];
      const source = new SourceFiles([]);
      assert.deepEqual(source.readBounded([{ path: paths[0] }]).files, [
        { status: "error", path: paths[0], error: "File not found" },
      ]);

      const create = source.applyAtomic(paths.map((path) => ({ type: "create", path, content: "test" })));
      assert.deepEqual(create.changedPaths, [...paths].sort());
      assert.equal(source.toSourceFiles().length, 2);

      const remove = source.applyAtomic(paths.map((path) => ({ type: "delete", path })));
      assert.deepEqual(remove.changedPaths, create.changedPaths);
      assert.deepEqual(source.toSourceFiles(), []);
    `,
  ], { encoding: "utf-8" });
  assert.equal(result.status, 0, result.stderr);
});
