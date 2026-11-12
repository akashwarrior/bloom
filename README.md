# Bloom

Bloom is a Next.js app for building and editing web projects through chat. PostgreSQL stores projects, chat runs, and revision metadata. S3-compatible storage holds attachments, generated images, and revision files. Redis carries resumable chat streams.

## Local development

Run PostgreSQL, Redis, and an S3-compatible service such as MinIO. Create the storage bucket before starting Bloom. Docker runs one shared preview container for local projects. Chromium is used for rendered previews and screenshots.

Set these values in `.env.local` or in the server environment.

| Variables | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string for chat streams |
| `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` | App origin and session secret |
| `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | S3-compatible object storage |
| `S3_BUCKET`, `S3_REGION` | Defaults to `project-assets` and `us-east-1` |
| `MUSE_API_KEY` | Chat, design and image model access |
| `EXA_API_KEY` | Web search |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google sign-in |
| `BLOOM_CHROMIUM_PATH` | Optional Chromium binary override |
| `BLOOM_RUNTIME` | Set to `vercel` or `docker` to override the platform default |

The storage endpoint must be reachable from browsers for direct uploads and downloads. Configure the bucket to allow uploads from the app origin.
When switching storage backends, copy existing objects with their original keys so saved projects can still load their files and attachments.

```sh
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm dev
```

## Code layout

| Path | Contents |
| --- | --- |
| `app/` | Pages and API routes. Routes wrap their handler in `route()` from `lib/http.server.ts` and authenticate with `requireUserId` or `requireProject`. |
| `lib/projects/` | Project access, versioned source (revisions and content-addressed blobs) and uploads |
| `lib/project-chat/` | Chat runs: leases, resumable streams, message branches |
| `lib/runtime/` | Preview runtimes (shared Docker container or one Vercel Sandbox per project) |
| `lib/billing.ts`, `lib/billing.server.ts` | Plans, credits and the credit ledger |
| `ai/` | The build agent: prompts, tools, design director and reviewer, context compaction |
| `components/` | App UI. `components/ui/` holds the shadcn primitives. |

## Billing

Purchases are simulated: subscribing, renewing, cancelling and buying credits take effect immediately without payment details. Every account starts on the Free plan with 5 credits a month. A finished generation costs one credit, and a new turn is refused at zero. Paid plans renew at the end of each period unless cancelled.

## Vercel deployment

Deployments on Vercel use one Vercel Sandbox per project and authenticate through the deployment's OIDC token. To try the Sandbox runtime locally, link the Vercel project, pull its development environment, and set `BLOOM_RUNTIME=vercel`. Local development defaults to the shared Docker container. [Vercel Sandbox authentication](https://vercel.com/docs/sandbox/concepts/authentication)

Set the production database, Redis, storage, auth, and model variables in Vercel. The storage service must be reachable from the deployed app and its users. Apply the Prisma migrations before starting the release.

Sandboxes serve previews on Vercel-issued URLs. Each session lasts 20 minutes by default. When a session ends, opening the preview again restores the saved revision. Share preview URLs with people who should see the project. [Vercel Sandbox duration and persistence](https://vercel.com/kb/guide/vercel-sandbox-duration-and-persistence)

## Release checks

```sh
pnpm lint
pnpm test
pnpm build
```

