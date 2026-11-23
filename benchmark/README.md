# Bloom benchmark

Builds a fixed set of prompts end to end with the current working tree and records what came out. Each run provisions an isolated copy of the app and its own preview container, sends every prompt as a single chat message, waits for the verified build and captures the result on desktop and mobile.

The same captures feed a blind comparison with other builders (see [Comparing with other builders](#comparing-with-other-builders)).

## Requirements

- Docker. The live `bloom-runtime` container is never touched.
- Chromium at `/usr/lib/chromium/chromium`, or set `CHROME_PATH`.
- Redis, with `REDIS_URL` in the shell or in `.env.local`.
- A migrated database (`pnpm exec prisma migrate deploy`) and the usual `.env`/`.env.local` with database, auth, storage and model credentials.
- `node_modules` installed in the repository root.
- ImageMagick 7 (`magick`) for the overview image.

The benchmark account pays for builds like any other account: one credit per finished build, and a new account has 5. Top it up through `POST /api/billing/credits` before running all eight prompts.

## Running

```bash
pnpm bench                                   # all eight prompts, one worker
node benchmark/bench.mjs --only=1,5          # selected prompts
node benchmark/bench.mjs --workers=2         # two isolated workers in parallel
node benchmark/bench.mjs --prompt="a menu site for a ramen bar" --slug=ramen
node benchmark/bench.mjs --list              # print the prompt set
pnpm bench:contact                           # rebuild benchmark-results/bloom/overview.webp
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--only=1,5` | all | Prompt numbers to run |
| `--prompt="a\|\|b"` | | Custom prompts instead of the fixed set, separated by `\|\|` |
| `--slug=a,b` | | Folder names for custom prompts |
| `--email=<address>` | `bench@bloom.local` | Account the run signs in as |
| `--workers=<n>` | `1` | Isolated workers running at once |
| `--force=true` | | Re-run prompts that already have `metrics.json` |
| `--keep=true` | | Keep the worker's app copy after the run, for debugging |
| `--out=<dir>` | `benchmark-results/bloom` | Results directory |
| `--capture=<projectId>` | | Capture an existing project instead of generating |
| `--revision=<id>` | | Restore this revision before `--capture` |
| `--index=<n>` | `1` | Prompt number to file a `--capture` under |
| `--origin=<url>` | | Use an app that is already running instead of a worker |
| `--container=<name>` | | Preview container of that app |
| `--app-dir=<dir>` | repository root | Directory of that app, for its logs |

Image generation quota is shared by all workers, so raise `--workers` only when the quota allows it. A build usually takes 6 to 17 minutes.

## How a run is isolated

For each worker the harness:

1. copies the working tree, including uncommitted changes, into `benchmark/.runs/worker-<id>/app` (without `.git`, `node_modules`, `.next`, `logs` or benchmark output) and links the repository's `node_modules`;
2. starts `next dev` on a free port, with its own `BLOOM_RUNTIME_CONTAINER`, so builds run in `bloom-bench-<runId>-<id>` rather than the live container;
3. removes the container and the app copy when it finishes (`--keep=true` keeps the copy).

## Results

```
benchmark-results/
  README.md               summary of the latest run
  bloom/
    overview.webp         first screen of every prompt
    01-coffee-roaster/
      desktop.png         full page at 1440 px
      mobile.png          full page at 390 px
      metrics.json        title, images loaded and failed, console errors, overflow, timings
      run.log             generation stream markers
      DESIGN.md           the design direction the build followed
      source.tar.gz       generated source (not committed)
      logs/               agent trace logs (not committed)
      errors.txt          only when the run failed
  compare/                blind comparison with other builders
```

Captures scroll through the whole page first so lazy images load, then take full-page screenshots. The metrics show whether a build works, not whether it looks good.

## Comparing with other builders

`compare.mjs` compares Bloom with Lovable and v0 on prompts 1 to 8 without the reviewers knowing which tool made which page. All results are captured by the same code (`capture.mjs`) at the same sizes.

```bash
node benchmark/bench.mjs --workers=2         # 1. Bloom builds the eight prompts
node benchmark/compare.mjs init              # 2. writes compare/PROMPTS.md and compare/urls.json
                                             #    run each prompt in Lovable and v0, publish, paste the URLs into urls.json
node benchmark/compare.mjs capture           # 3. captures the published sites
node benchmark/compare.mjs review            # 4. shuffles every prompt's results into options A, B, C
                                             #    reviewers open compare/review/index.html and save scores as compare/scores/<name>.csv
node benchmark/compare.mjs tally             # 5. unblinds the scores into compare/RESULTS.md
```

Reviewers score each option from 1 to 5 on:

- **originality**: made for this subject, not a template;
- **polish**: type, spacing, colour and imagery hold together;
- **mobile**: reads and works at phone width;
- **truthfulness**: no invented prices, reviews, statistics or addresses;
- **usefulness**: a clear offer and a main action that works.

They also rank the options within each prompt. `compare/review/key.json` maps the letters back to tools, so reviewers should not open it until they have scored. Sites that answer with a bot check are skipped with a message naming the folder where their screenshots can be saved by hand.

## Troubleshooting

- A failed prompt leaves `errors.txt` in its folder. Re-run with `--keep=true` to read the worker's `benchmark/.runs/worker-<id>/dev.log`.
- If a run is killed, remove leftover containers with `docker ps --filter name=bloom-bench-` and `docker rm -f <name>`.
