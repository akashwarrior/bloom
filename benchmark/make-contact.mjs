#!/usr/bin/env node
// Build contact sheets from benchmark screenshots.
//
// Sources are looked up at this path for each prompt:
//   benchmark-results/01-coffee-roaster/desktop.png
//
// Outputs:
//   benchmark-results/contact-sheet.png
//   benchmark-results/detail-1-4.png
//   benchmark-results/detail-5-8.png
//   benchmark-results/overview/*.png
//   benchmark-results/thumbs/*.png
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(BENCH_DIR, "..");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const RESULTS = path.resolve(args.results ?? path.join(ROOT, "benchmark-results"));
const OUT = path.resolve(args.out ?? RESULTS);

const PROMPTS = [
  { slug: "coffee-roaster", title: "Coffee roaster" },
  { slug: "meeting-notes", title: "Meeting notes app" },
  { slug: "furniture-studio", title: "Furniture studio" },
  { slug: "patagonia-lodge", title: "Patagonia lodge" },
  { slug: "bike-coop", title: "Bike coop" },
  { slug: "kestrel-keyboard", title: "Kestrel 65" },
  { slug: "lisbon-film", title: "Lisbon film festival" },
  { slug: "freelance-finance", title: "Freelance finance" },
];

const BACKGROUND = "#f4f0e8";
const SHEET_BACKGROUND = "#e6e1d6";
const INK = "#141414";
const FONT = "Liberation-Sans";

function log(message) {
  console.log(`[contact] ${message}`);
}

function magick(imageArgs) {
  execFileSync("magick", imageArgs, { stdio: ["ignore", "ignore", "inherit"] });
}

function desktopFor(index, slug) {
  const number = String(index).padStart(2, "0");
  const candidate = path.join(RESULTS, `${number}-${slug}`, "desktop.png");
  return existsSync(candidate) ? candidate : null;
}

function addLabel(source, destination, width, bandHeight, pointSize, label) {
  magick([
    source,
    "-resize",
    `${width}x`,
    "-background",
    BACKGROUND,
    "-gravity",
    "center",
    "-splice",
    `0x${bandHeight}`,
    "-gravity",
    "north",
    "-font",
    FONT,
    "-pointsize",
    String(pointSize),
    "-fill",
    INK,
    "-annotate",
    `+0+${Math.round(bandHeight * 0.26)}`,
    label,
    destination,
  ]);
}

function montage(sources, tile, output) {
  magick([
    "montage",
    ...sources,
    "-tile",
    tile,
    "-geometry",
    "+10+10",
    "-background",
    SHEET_BACKGROUND,
    output,
  ]);
}

function main() {
  try {
    execFileSync("magick", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ImageMagick 7 (`magick`) is required to build contact sheets");
  }

  const overviewDir = path.join(OUT, "overview");
  const thumbsDir = path.join(OUT, "thumbs");
  mkdirSync(overviewDir, { recursive: true });
  mkdirSync(thumbsDir, { recursive: true });

  const overviewFiles = [];
  const thumbFiles = [];

  for (const [offset, prompt] of PROMPTS.entries()) {
    const index = offset + 1;
    const number = String(index).padStart(2, "0");
    const source = desktopFor(index, prompt.slug);
    if (!source) {
      log(`skip ${number}-${prompt.slug} (no desktop.png)`);
      continue;
    }

    const label = `${number} · ${prompt.title}`;
    const overview = path.join(overviewDir, `${number}.png`);
    const thumb = path.join(thumbsDir, `${number}.png`);
    addLabel(source, overview, 430, 40, 20, label);
    addLabel(source, thumb, 760, 54, 26, label);
    overviewFiles.push(overview);
    thumbFiles.push(thumb);
    log(`added ${path.relative(ROOT, source)}`);
  }

  if (overviewFiles.length === 0) {
    throw new Error(`No benchmark screenshots found in ${RESULTS}`);
  }

  montage(overviewFiles, "4x2", path.join(OUT, "contact-sheet.png"));
  log(`wrote ${path.relative(ROOT, path.join(OUT, "contact-sheet.png"))}`);

  const first = thumbFiles.slice(0, 4);
  const second = thumbFiles.slice(4, 8);
  if (first.length > 0) {
    montage(first, "2x2", path.join(OUT, "detail-1-4.png"));
    log(`wrote ${path.relative(ROOT, path.join(OUT, "detail-1-4.png"))}`);
  }
  if (second.length > 0) {
    montage(second, "2x2", path.join(OUT, "detail-5-8.png"));
    log(`wrote ${path.relative(ROOT, path.join(OUT, "detail-5-8.png"))}`);
  }
}

main();
