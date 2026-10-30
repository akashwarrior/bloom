import assert from "node:assert/strict";
import test from "node:test";

import { assertForegroundCommand } from "../lib/runtime/command-policy.ts";

test("servers and watch modes are rejected by the command, not by words inside a script", () => {
  for (const [executable, args] of [
    ["pnpm", ["dev"]],
    ["pnpm", ["run", "start"]],
    ["pnpm", ["exec", "next", "dev"]],
    ["node", ["node_modules/next/dist/bin/next", "dev"]],
    ["pnpm", ["exec", "vitest", "--watch"]],
  ] as const) {
    assert.throws(() => assertForegroundCommand(executable, [...args]), /Persistent development servers/, `${executable} ${args.join(" ")}`);
  }
  const script = "const fs=require('fs'); let t=fs.readFileSync('app/page.tsx','utf8'); t=t.replace('Start speaking', 'Start free'); // serve the dev copy\nfs.writeFileSync('app/page.tsx', t)";
  assert.doesNotThrow(() => assertForegroundCommand("node", ["-e", script]));
  assert.doesNotThrow(() => assertForegroundCommand("pnpm", ["exec", "tsc", "--noEmit"]));
  assert.doesNotThrow(() => assertForegroundCommand("pnpm", ["exec", "tsx", "scripts/start.ts"]));
});
