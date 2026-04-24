# Church Finder

Church Finder is a React Router + Cloudflare Workers app that puts three public church directories on one map:

- Southern Baptist Convention
- Founders Ministries
- 9Marks

The search UI streams cached results first, then refreshes stale directory data in the background so a user can see nearby churches without waiting for every scraper to finish.

## What Lives Here

- `app/routes/home.tsx`: search experience, map/list layout, and live search bootstrapping
- `app/routes/admin.tsx`: password-protected admin console for scrapes, dedupe, logs, search stats, and submissions
- `app/routes/api/live-search.ts`: server-sent events endpoint that returns cached results immediately and optionally refreshes stale sources
- `app/routes/api/scrape.ts`: token-protected manual scrape trigger
- `app/routes/api/submit.ts`: suggestion/contact submission endpoint protected by Cloudflare Turnstile
- `app/services/scrapers/`: source-specific scrapers plus orchestration and cross-reference merge logic
- `workers/app.ts`: Cloudflare Worker entrypoint for HTTP traffic and the daily scheduled job
- `prisma/schema.prisma`: Prisma models used against D1 in production and SQLite/LibSQL in local dev
- `migrations/`: raw SQL migrations applied to the Cloudflare D1 database

## Stack

- React 19 + React Router 7 SSR
- Vite + Tailwind CSS 4
- Cloudflare Workers + D1
- Prisma 7
- Leaflet / React Leaflet

## Local Setup

### Prerequisites

- Node.js 20+
- npm
- `sqlite3` if you want to use the repo's `file:./dev.db` local database path
- Cloudflare Wrangler if you want to run migrations or exercise the Worker runtime locally

### 1. Install dependencies

```bash
npm ci
```

### 2. Copy local env defaults

```bash
cp .dev.vars.example .dev.vars
```

The checked-in example covers the minimum values already documented by the repo:

```dotenv
DATABASE_URL="file:./dev.db"
SCRAPE_TOKEN="dev-secret-change-me"
ADMIN_PASSWORD="dev-admin-password"
```

If you want to test submission CAPTCHA or admin-triggered Cloudflare schedule calls locally, also add:

```dotenv
CF_TURNSTILE_SITE_KEY=""
CF_TURNSTILE_SECRET_KEY=""
CF_API_TOKEN=""
```

### 3. Generate the Prisma client

The Prisma client is generated into `app/db/`, which is gitignored.

```bash
npx prisma generate
```

### 4. Initialize a local database

The repo currently keeps its canonical schema as D1 SQL migrations in `migrations/`, while `npm run dev` uses the local fallback in `app/db.local.server.ts` and defaults to `DATABASE_URL=file:./dev.db`.

That means `dev.db` needs to exist with the current schema before the app can read from it. One simple option is to apply the checked-in SQL migrations to `dev.db` in order:

```bash
sqlite3 dev.db < migrations/0000_initial_schema.sql
sqlite3 dev.db < migrations/0001_search_log.sql
sqlite3 dev.db < migrations/0002_submissions.sql
sqlite3 dev.db < migrations/0003_church_page_cache.sql
sqlite3 dev.db < migrations/0004_coords_approximate.sql
```

If you prefer Cloudflare-local D1 instead of `dev.db`, the repo also includes:

```bash
npm run d1:migrate:local
```

### 5. Start the app

```bash
npm run dev
```

By default Vite serves the app on [http://localhost:3000](http://localhost:3000).

### 6. Run the same checks CI uses

```bash
npx prisma generate
npm run typecheck
npm run test:founders
npm run build
```

## Environment Variables And Bindings

| Name | Where used | Notes |
| --- | --- | --- |
| `DATABASE_URL` | local dev only | Used by `app/db.local.server.ts`. Defaults to `file:./dev.db`. |
| `D1_DATABASE` | Cloudflare binding | Required in deployed/Worker execution paths. Declared in `wrangler.jsonc`. |
| `ADMIN_PASSWORD` | `/admin` | Required for admin login. |
| `SCRAPE_TOKEN` | `/api/scrape` | Shared secret for token-protected manual scrape requests. |
| `CF_API_TOKEN` | admin maintenance actions | Used when the admin page queues scheduled Cloudflare tasks for cross-reference or forced SBC scraping. |
| `CF_TURNSTILE_SITE_KEY` | root loader/footer | Public site key used by the submission modal. |
| `CF_TURNSTILE_SECRET_KEY` | `/api/submit` | Secret key used to verify Turnstile submissions server-side. |

## Search, Scrape, And Admin Overview

### Search flow

1. The home loader geocodes the query and returns the search center.
2. The client opens an `EventSource` connection to `/api/live-search`.
3. `/api/live-search` immediately sends cached D1 results and logs the search in `SearchLog`.
4. If nearby Founders or 9Marks data is stale, the endpoint live-fetches those sources, upserts fresh records, and streams updated result sets back to the browser.
5. Nearby SBC profiles may also be enriched from `ChurchPageCache` when the search area includes unenriched SBC entries.

### Scraping model

- `workers/app.ts` handles normal HTTP traffic and the scheduled worker entrypoint.
- The Worker is configured to run daily at `0 3 * * *` in `wrangler.jsonc`.
- `runScrape()` in `app/services/scrapers/orchestrator.ts` handles these modes:
  - `9marks`
  - `founders`
  - `sbc`
  - `all`
- SBC scraping is intentionally chunked across four runs and only restarts a full cycle when the previous successful cycle is older than 30 days.
- After the final SBC chunk, the cross-reference merge runs to combine likely duplicate records.

### Admin page

The admin route exposes:

- aggregate church counts by source
- recent scrape logs
- search counts and a search heatmap
- recent search coordinates and radius
- incoming site submissions
- maintenance actions to start:
  - SBC scrape
  - Founders scrape
  - cross-reference merge

The Founders button runs on the current Worker with `waitUntil`. The SBC and cross-reference buttons queue work for the scheduled Worker path and rely on `CF_API_TOKEN`.

## Useful Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local development server |
| `npm run build` | Generate Prisma client and build the app into `build/` |
| `npm run deploy` | Build, then deploy the Worker with Wrangler |
| `npm run typecheck` | Generate route types and run TypeScript |
| `npm run test:founders` | Run the parser test for the Founders scraper |
| `npm run d1:migrate` | Apply checked-in migrations to the remote D1 database |
| `npm run d1:migrate:local` | Apply checked-in migrations to local D1 |
| `npm run d1:create-migration` | Create a new D1 migration |
| `npm run generate-icons` | Rebuild favicon/app icon assets |

## Deployment Basics

This repo is already wired for Cloudflare deployment:

- `wrangler.jsonc` points the Worker entrypoint at `workers/app.ts`
- static assets are served from `build/client`
- the D1 binding is named `D1_DATABASE`
- the app has a daily cron trigger
- the current config includes custom-domain routes for `basedchurchfinder.com`

A typical deploy flow is:

```bash
npm ci
npx prisma generate
npm run build
npm run d1:migrate
npm run deploy
```

Before the first deploy, make sure Cloudflare has the required secrets and bindings:

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SCRAPE_TOKEN
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put CF_TURNSTILE_SECRET_KEY
```

`CF_TURNSTILE_SITE_KEY` is a public value and can stay as a normal Worker var if that matches your environment strategy.

## CI

GitHub Actions CI lives in `.github/workflows/ci.yml` and currently runs:

- `npm ci`
- `npx prisma generate`
- `npm run typecheck`
- `npm run test:founders`
- `npm run build`

That keeps the workflow aligned with the actual scripts and with the generated Prisma client requirement in this repo.
