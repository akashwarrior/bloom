#!/usr/bin/env node
// Builds benchmark-results/bloom/overview.webp: the first screen of every prompt's desktop capture, labelled.
//
//   node benchmark/make-contact.mjs [--results=benchmark-results/bloom]
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PROMPTS } from "./prompts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultsArg = process.argv.find((arg) => arg.startsWith("--results="))?.split("=")[1];
const RESULTS = path.resolve(resultsArg ?? path.join(ROOT, "benchmark-results", "bloom"));

const magick = (args) => execFileSync("magick", args, { stdio: ["ignore", "ignore", "inherit"] });

const scratch = mkdtempSync(path.join(os.tmpdir(), "bloom-contact-"));
try {
  const tiles = PROMPTS.flatMap((prompt, index) => {
    const number = String(index + 1).padStart(2, "0");
    const source = path.join(RESULTS, `${number}-${prompt.slug}`, "desktop.png");
    if (!existsSync(source)) return [];
    const tile = path.join(scratch, `${number}.png`);
    magick([
      source, "-crop", "1440x900+0+0", "+repage", "-resize", "640x",
      "-background", "#f4f0e8", "-gravity", "north", "-splice", "0x44",
      "-font", "Liberation-Sans", "-pointsize", "20", "-fill", "#141414",
      "-annotate", "+0+11", `${number} · ${prompt.title}`, tile,
    ]);
    return [tile];
  });
  if (!tiles.length) throw new Error(`No desktop captures in ${path.relative(ROOT, RESULTS)}`);
  const output = path.join(RESULTS, "overview.webp");
  magick(["montage", ...tiles, "-tile", "4x", "-geometry", "+10+10", "-background", "#e6e1d6", "-quality", "82", output]);
  console.log(`[contact] wrote ${path.relative(ROOT, output)} (${tiles.length} prompts)`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
