<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Checking changes to the build agent

- `pnpm exec tsc --noEmit`, `pnpm lint` and `pnpm test` cover types, lint and the unit tests.
- A real build that leaves the live runtime alone: `node benchmark/bench.mjs --prompt="..." --slug=<name> --email=<fresh>@bloom.local --out=<dir>` (see `benchmark/README.md`). It creates projects under that account in the main database; delete them afterwards.
- A generated project's preview only loads its scripts from `http://bloom-preview.localhost:<port>`; Next.js blocks other dev origins, so `127.0.0.1:<port>` renders without hydrating.

# Conventions

- API routes wrap their handler in `route()` from `lib/http.server.ts`, authenticate with `requireUserId` or `requireProject` (`lib/projects/access.server.ts`), parse input with `parseJson`/`parseSearchParams`, and throw `HttpError` for expected failures. Session checks happen in the handler; there is no proxy.
- Agent code (prompts, tools, design director, context management) lives in `ai/`. Prompt files under `ai/prompts/` are product behaviour: change their wording only on purpose.
- The schema has a single initial migration (`prisma/migrations/*_init`). Add new migrations with `pnpm exec prisma migrate dev --name <change>`.
- Billing is simulated (`lib/billing.server.ts`). Each committed generation is charged one credit through its chat run; a benchmark account starts with 5 credits, and `POST /api/billing/credits` tops it up.
