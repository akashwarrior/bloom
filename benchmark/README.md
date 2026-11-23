# Bloom design benchmark

Self-contained harness for running the same eight design prompts against the
current working tree. It provisions isolated app copies and Docker containers,
runs the real generation workflow, captures desktop/mobile screenshots, and
saves the generated source and trace logs.

Nothing outside this repository is required after setup. Previous benchmark
images are archived under `benchmark-results/previous/`.

## Requirements

- Docker running locally (the live `bloom-runtime` container is not touched)
- Chromium at `/usr/lib/chromium/chromium` (override with `CHROME_PATH`)
- ImageMagick 7 (`magick`) for contact sheets
- A working `.env`/`.env.local` with database, auth, and model credentials
- A running Redis instance and `REDIS_URL` in the shell or `.env.local` (for example, `redis://127.0.0.1:6379`)
- An up-to-date Bloom database schema from `pnpm exec prisma migrate deploy`
- `node_modules` installed in the repository root

The harness checks Redis before provisioning generation workers. Workers copy
`.env` and `.env.local` and override only `BETTER_AUTH_URL` and
`BLOOM_RUNTIME_CONTAINER`. When using an existing app, configure Redis on that
app's server.

## Usage

```bash
# Run all eight prompts with one isolated worker
pnpm bench

# Quick smoke test: one prompt, current working tree
node benchmark/bench.mjs --only=5 --workers=1 --force=true

# Run two prompts concurrently (each gets its own app copy and container)
node benchmark/bench.mjs --only=1,2 --workers=2

# List prompts
node benchmark/bench.mjs --list

# Build contact sheets from whatever is in benchmark-results/
pnpm bench:contact

# Keep the worker app copy after the run for debugging
node benchmark/bench.mjs --only=3 --keep=true

# Re-capture an existing project/revision without generating
node benchmark/bench.mjs --capture=<projectId> --index=7
node benchmark/bench.mjs --capture=<projectId> --index=7 --revision=<revisionId>

# Use an already-running app instead of provisioning a worker
node benchmark/bench.mjs --origin=http://127.0.0.1:3000 \
  --container=bloom-runtime --app-dir=. --only=1
```

Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `--only=1,5` | all | Prompt numbers to run |
| `--prompt="a\|\|b"` | | Run custom prompts instead of the built-in set, separated by `\|\|` (`--slug=a,b` names their result folders) |
| `--email=<address>` | `bench@bloom.local` | Account the run signs in as; a fresh one starts without earlier projects |
| `--workers=1` | `1` | Concurrent isolated workers (each = app copy + container) |
| `--force=true` | skip complete | Re-run even if `metrics.json` exists |
| `--keep=true` | delete | Keep `benchmark/.runs/worker-*/app` |
| `--out=<dir>` | `benchmark-results` | Result directory |
| `--list` | | Print prompt numbers and slugs |
| `--capture=<id>` | | Capture an existing project instead of generating |
| `--revision=<id>` | | Restore a revision before capture |
| `--index=<n>` | `1` | Prompt number used with `--capture` |
| `--origin=<url>` | | Use an existing app instead of provisioning |
| `--container=<name>` | | Container used by an existing app |
| `--app-dir=<dir>` | repo root | App directory used by an existing app (for logs) |

One worker is the default because image-model quota is shared across workers.
Raise `--workers` only when you have quota and want to trade latency for load.

## How isolation works

For each worker the harness:

1. Copies the **current working tree** (including uncommitted changes) into
   `benchmark/.runs/worker-<id>/app`, excluding `.git`, `node_modules`,
   `.next`, `logs`, and benchmark output.
2. Symlinks `app/node_modules` to the repository's `node_modules`.
3. Picks a free localhost port and starts `next dev` there.
4. Writes a unique `BLOOM_RUNTIME_CONTAINER` so the runtime creates
   `bloom-bench-<runId>-<id>` instead of reusing the live `bloom-runtime`.
5. Removes the worker's container and app copy on exit (`--keep=true` to keep
   the copy; the container is always removed).

The generated sites run inside their own container, so each worker also gets an
isolated preview. Existing benchmark containers and the live `bloom-runtime`
are left alone.

## Output layout

```
benchmark-results/
  01-coffee-roaster/
    desktop.png
    mobile.png
    metrics.json       # title, description, image counts, errors, timings
    run.log            # generation stream markers
    DESIGN.md          # generated design system
    source.tar.gz      # generated app/components/lib
    logs/              # request trace JSONL files
    errors.txt         # only when something failed
  ...
  contact-sheet.png
  detail-1-4.png
  detail-5-8.png
  overview/*.png
  thumbs/*.png
  summary-<timestamp>.json
  previous/            # archived earlier benchmark images
```

Captures scroll through the whole page before taking a full-page screenshot so
lazy-loaded images get a chance to load. `metrics.json` records image totals,
loaded/failed counts, lazy counts, console errors, overflow, page height, and
title/description metadata.

`REPORT.md` in `benchmark-results/previous/` describes the earlier run. New
runs only write measurements and screenshots; review them manually or with
`contact-sheet.png`.

## Comparing with other builders

`compare.mjs` runs a blind comparison of Bloom against Lovable and v0 on the same eight prompts (`prompts.mjs`). Every result is captured by the same code (`capture.mjs`) at the same sizes.

```bash
# 1. Bloom: generate all eight prompts
node benchmark/bench.mjs --workers=2 --out=benchmark-results/compare/bloom

# 2. Write benchmark-results/compare/PROMPTS.md and an empty urls.json
node benchmark/compare.mjs init
#    Run each prompt in Lovable and v0 as described in PROMPTS.md, publish, and paste the URLs into urls.json

# 3. Capture the published sites
node benchmark/compare.mjs capture

# 4. Shuffle the results into anonymous options A/B/C per prompt
node benchmark/compare.mjs review
#    Reviewers open review/index.html, fill a copy of review/scores-template.csv and save it as scores/<name>.csv

# 5. Unblind the scores into RESULTS.md
node benchmark/compare.mjs tally
```

Each option is scored 1 to 5 on originality, polish, mobile, truthfulness (no invented prices, reviews, stats or addresses) and usefulness, and ranked within its prompt. `review/key.json` maps the letters back to tools; reviewers should not open it before scoring. Sites that answer with a bot check are skipped with a message; save their screenshots by hand in the folder it names.

## Notes

- Runs make real model calls and can take a long time. A single prompt commonly
  takes several minutes; the full set can take tens of minutes.
- If a run fails, check `run.log`, `errors.txt`, and the worker's `dev.log`
  (use `--keep=true`, at `benchmark/.runs/worker-<id>/dev.log`).
- Containers are named `bloom-bench-<runId>-<id>`; if a run is killed hard,
  remove leftovers with `docker ps --filter name=bloom-bench-` and
  `docker rm -f <name>`.
- The harness never deletes the live `bloom-runtime` container.
