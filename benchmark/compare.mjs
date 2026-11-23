#!/usr/bin/env node
// Blind design comparison of Bloom against other builders on the benchmark prompts.
//
//   node benchmark/compare.mjs init      writes compare/urls.json and compare/PROMPTS.md
//   node benchmark/compare.mjs capture   captures every URL in urls.json the way bench.mjs captures Bloom
//   node benchmark/compare.mjs review    shuffles the results into anonymous A/B/C sets and a score sheet
//   node benchmark/compare.mjs tally     unblinds the filled score sheets into compare/RESULTS.md
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { capture } from "./capture.mjs";
import { PROMPTS } from "./prompts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.resolve(process.env.COMPARE_DIR ?? path.join(ROOT, "benchmark-results", "compare"));
const BLOOM = path.resolve(process.env.COMPARE_BLOOM_DIR ?? path.join(ROOT, "benchmark-results", "bloom"));
const REVIEW = path.join(DIR, "review");
const SCORES = path.join(DIR, "scores");
const PROVIDERS = ["bloom", "lovable", "v0"];
const EXTERNAL = PROVIDERS.filter((provider) => provider !== "bloom");
const CRITERIA = [
  ["originality", "Feels made for this subject, not a template"],
  ["polish", "Type, spacing, colour and imagery hold together"],
  ["mobile", "Reads and works well at phone width"],
  ["truthfulness", "No invented facts: prices, reviews, stats, addresses"],
  ["usefulness", "The page does its job: clear offer and a working main action"],
];

const BOT_CHECK = /just a moment|security verification|attention required|verify you are human/i;

const slugOf = (index) => `${String(index + 1).padStart(2, "0")}-${PROMPTS[index].slug}`;
const exists = (file) => fs.access(file).then(() => true, () => false);
const resultsOf = (provider) => (provider === "bloom" ? BLOOM : path.join(DIR, provider));
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const log = (message) => console.log(`[compare] ${message}`);

async function init() {
  await fs.mkdir(DIR, { recursive: true });
  const urlsFile = path.join(DIR, "urls.json");
  if (!(await exists(urlsFile))) {
    const urls = Object.fromEntries(
      EXTERNAL.map((provider) => [provider, Object.fromEntries(PROMPTS.map((_, index) => [slugOf(index), ""]))]),
    );
    await fs.writeFile(urlsFile, `${JSON.stringify(urls, null, 2)}\n`);
  }
  const prompts = PROMPTS.map((prompt, index) => `${index + 1}. **${prompt.title}** (\`${slugOf(index)}\`)\n\n   \`\`\`\n   ${prompt.prompt}\n   \`\`\``).join("\n\n");
  await fs.writeFile(
    path.join(DIR, "PROMPTS.md"),
    `# Comparison prompts

Run each prompt once in Lovable and once in v0, exactly as written, in a new project each time.

- Paste the prompt as the first and only message. Do not attach images, pick templates or send follow-ups.
- Wait until the first generation finishes, then publish it (Lovable: Publish; v0: Deploy) and copy the public site URL, not the chat URL.
- Paste each URL into \`benchmark-results/compare/urls.json\` under the provider and prompt key.
- Bloom was given the same text through \`benchmark/bench.mjs\`, also as a single message. Its results are in \`benchmark-results/bloom/\`.
- If a site blocks automated capture, save full-page screenshots yourself as \`desktop.png\` (1440 px wide) and \`mobile.png\` (390 px wide) in \`benchmark-results/compare/<provider>/<prompt key>/\`.

${prompts}
`,
  );
  log(`wrote ${path.relative(ROOT, urlsFile)} and PROMPTS.md`);
}

async function captureAll() {
  const urls = await readJson(path.join(DIR, "urls.json"));
  const requireFromRoot = createRequire(path.join(ROOT, "package.json"));
  const browser = await requireFromRoot("puppeteer-core").launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/lib/chromium/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });
  try {
    for (const provider of EXTERNAL) {
      for (const [slug, url] of Object.entries(urls[provider] ?? {})) {
        if (!url) continue;
        const directory = path.join(resultsOf(provider), slug);
        await fs.mkdir(directory, { recursive: true });
        log(`capture ${provider} ${slug}`);
        try {
          const screenshots = await capture(browser, url, directory);
          if (BOT_CHECK.test(screenshots.desktop?.title ?? "")) {
            log(`blocked ${provider} ${slug}: the site served a bot check. Save desktop.png (1440 wide) and mobile.png (390 wide) full-page screenshots into ${path.relative(ROOT, directory)} by hand.`);
            await fs.rm(directory, { recursive: true, force: true });
            continue;
          }
          await fs.writeFile(path.join(directory, "metrics.json"), `${JSON.stringify({ provider, slug, url, screenshots }, null, 2)}\n`);
        } catch (error) {
          log(`failed ${provider} ${slug}: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
  } finally {
    await browser.close();
  }
}

async function review() {
  await fs.rm(REVIEW, { recursive: true, force: true });
  await fs.mkdir(REVIEW, { recursive: true });
  await fs.mkdir(SCORES, { recursive: true });
  const key = {};
  const sections = [];
  for (const [index, prompt] of PROMPTS.entries()) {
    const slug = slugOf(index);
    const available = [];
    for (const provider of PROVIDERS) {
      if (await exists(path.join(resultsOf(provider), slug, "desktop.png"))) available.push(provider);
    }
    if (available.length < 2) {
      log(`skip ${slug}: ${available.length} result(s)`);
      continue;
    }
    const order = available
      .map((provider) => ({ provider, sort: crypto.randomInt(1_000_000) }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ provider }) => provider);
    key[slug] = {};
    const columns = [];
    for (const [position, provider] of order.entries()) {
      const label = String.fromCharCode(65 + position);
      key[slug][label] = provider;
      await fs.mkdir(path.join(REVIEW, slug), { recursive: true });
      for (const view of ["desktop", "mobile"]) {
        await fs.copyFile(path.join(resultsOf(provider), slug, `${view}.png`), path.join(REVIEW, slug, `${label}-${view}.png`));
      }
      columns.push(`<figure><figcaption>${label}</figcaption><img src="${slug}/${label}-desktop.png" alt="Option ${label}, desktop"><img class="mobile" src="${slug}/${label}-mobile.png" alt="Option ${label}, mobile"></figure>`);
    }
    sections.push(`<section><h2>${index + 1}. ${prompt.title}</h2><p class="prompt">${prompt.prompt}</p><div class="options">${columns.join("")}</div></section>`);
  }

  await fs.writeFile(path.join(REVIEW, "key.json"), `${JSON.stringify(key, null, 2)}\n`);
  await fs.writeFile(
    path.join(REVIEW, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Blind design review</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:32px;background:#f4f4f2;color:#111}
h1{margin:0 0 8px}section{margin:48px 0}h2{margin:0}.prompt{color:#555;margin:4px 0 16px}
.options{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;align-items:start}
figure{margin:0;background:#fff;border-radius:10px;padding:12px}figcaption{font-weight:700;font-size:22px;margin-bottom:8px}
img{display:block;width:100%;border:1px solid #ddd}img.mobile{width:45%;margin-top:12px}
</style>
<h1>Blind design review</h1>
<p>Each prompt was built once by each tool. Options are shuffled per prompt. Score every option 1 to 5 on each criterion in <code>scores-template.csv</code>, and rank the options for each prompt (1 = best). Do not open <code>key.json</code> until scores are in.</p>
<ul>${CRITERIA.map(([name, description]) => `<li><b>${name}</b>: ${description}</li>`).join("")}</ul>
${sections.join("\n")}`,
  );
  const rows = Object.entries(key).flatMap(([slug, options]) =>
    Object.keys(options).map((label) => [slug, label, ...CRITERIA.map(() => ""), ""].join(",")),
  );
  await fs.writeFile(
    path.join(REVIEW, "scores-template.csv"),
    `${["prompt", "option", ...CRITERIA.map(([name]) => name), "rank"].join(",")}\n${rows.join("\n")}\n`,
  );
  log(`review ready: ${path.relative(ROOT, path.join(REVIEW, "index.html"))} (${Object.keys(key).length} prompts)`);
  log(`reviewers save filled copies of scores-template.csv into ${path.relative(ROOT, SCORES)}/<name>.csv`);
}

async function tally() {
  const key = await readJson(path.join(REVIEW, "key.json"));
  const sheets = (await fs.readdir(SCORES)).filter((file) => file.endsWith(".csv"));
  if (!sheets.length) throw new Error(`No score sheets in ${path.relative(ROOT, SCORES)}`);
  const totals = Object.fromEntries(PROVIDERS.map((provider) => [provider, { scores: {}, ranks: [], wins: 0 }]));
  for (const sheet of sheets) {
    const [header, ...lines] = (await fs.readFile(path.join(SCORES, sheet), "utf8")).trim().split(/\r?\n/);
    const columns = header.split(",");
    for (const line of lines) {
      const row = Object.fromEntries(line.split(",").map((value, index) => [columns[index], value.trim()]));
      const provider = key[row.prompt]?.[row.option];
      if (!provider) continue;
      for (const [name] of CRITERIA) {
        const score = Number(row[name]);
        if (score >= 1 && score <= 5) (totals[provider].scores[name] ??= []).push(score);
      }
      const rank = Number(row.rank);
      if (rank >= 1) {
        totals[provider].ranks.push(rank);
        if (rank === 1) totals[provider].wins += 1;
      }
    }
  }
  const mean = (values = []) => (values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : "–");
  const scored = PROVIDERS.filter((provider) => totals[provider].ranks.length);
  const table = [
    `| Tool | ${CRITERIA.map(([name]) => name).join(" | ")} | Mean rank | First places |`,
    `| --- | ${CRITERIA.map(() => "---").join(" | ")} | --- | --- |`,
    ...scored.map((provider) => {
      const total = totals[provider];
      return `| ${provider} | ${CRITERIA.map(([name]) => mean(total.scores[name])).join(" | ")} | ${mean(total.ranks)} | ${total.wins} |`;
    }),
  ];
  await fs.writeFile(
    path.join(DIR, "RESULTS.md"),
    `# Blind comparison results\n\n${sheets.length} reviewer(s), ${Object.keys(key).length} prompts. Scores are 1 to 5 (higher is better); rank is 1 to ${PROVIDERS.length} (lower is better).\n\n${table.join("\n")}\n`,
  );
  log(`wrote ${path.relative(ROOT, path.join(DIR, "RESULTS.md"))}`);
}

const commands = { init, capture: captureAll, review, tally };
const command = commands[process.argv[2]];
if (!command) {
  console.log("usage: node benchmark/compare.mjs <init|capture|review|tally>");
  process.exit(1);
}
await command();
