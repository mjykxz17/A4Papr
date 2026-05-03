# A4 Papr

A web tool for students to build print-ready exam cheatsheets by dragging asset blocks (text, formula, table) onto an A4 canvas.

> **Status: MVP scaffold.** The full editor loop (build → drag onto canvas → auto-save → export PDF) works end-to-end. Print fidelity is the product — see [DECISIONS.md](./DECISIONS.md) for stack rationale and [CHEATSHEETMAKER.md](./CHEATSHEETMAKER.md) for the original spec.

## Quick start

```bash
# 1. Postgres in Docker
docker compose up -d postgres

# 2. Env (copy and edit)
cp .env.example .env

# 3. Install + migrate + dev
pnpm install
pnpm db:migrate
pnpm dev
```

`pnpm dev` runs the web app on **http://localhost:3000** and the PDF worker on **http://localhost:4000**, both in watch mode.

## Repo layout

```
apps/
  web/              Next.js 15 (App Router) — UI, canvas, API routes
  worker/           Hono server — long-lived Puppeteer for PDF rendering
packages/
  shared/           Zod schemas, mm/px utils, A4 constants
  db/               Drizzle schema + migrations
  pdf/              Puppeteer wrapper used by the worker
DECISIONS.md        Stack rationale
CHEATSHEETMAKER.md  Original product spec
```

## Environment variables

All variables live in `.env` (see `.env.example`):

| Var | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | web, worker | Postgres connection string |
| `SESSION_SECRET` | web | HMAC key for the device-id cookie (32+ bytes) |
| `WORKER_URL` | web | Where the PDF worker listens (default `http://localhost:4000`) |
| `APP_URL` | worker | Where Puppeteer should navigate to render `/print/:id` |
| `WORKER_SHARED_SECRET` | web, worker | Bearer token between web and worker |
| `PORT` | worker | Worker listen port (default `4000`) |

Generate secrets with `openssl rand -hex 32`.

## How it works

- **No auth in v1.** Every visitor gets a UUID `device_id` in a signed cookie. Cheatsheets, blocks, and placements are keyed by that UUID. Clear the cookie and you start fresh.
- **Canvas units.** Positions and sizes are stored in millimetres. Render-time we convert to CSS px (96 DPI) for the screen, or PostScript points (72 DPI) for the PDF. Every coordinate round-trips losslessly because the source of truth is mm.
- **Auto-save.** Every meaningful canvas change queues into a pending patch. The patch flushes 500 ms after the last change, on tab close (`navigator.sendBeacon`), and immediately before export. Failures re-queue.
- **PDF render.** The web app exposes `/print/:id` — a chrome-free A4 page with absolute-positioned blocks. The worker's `POST /render` route boots a shared Puppeteer browser, navigates to that page with the worker shared secret, and returns the PDF stream. Web tier proxies the stream to the user.

## Scripts

| Command | Effect |
|---|---|
| `pnpm dev` | Run web + worker in watch mode |
| `pnpm build` | Build everything |
| `pnpm typecheck` | TS strict typecheck across the workspace |
| `pnpm lint` | ESLint across the workspace |
| `pnpm test` | Vitest unit + integration suites |
| `pnpm test:e2e` | Playwright golden-path test (requires running web + worker + DB) |
| `pnpm db:generate` | Generate a Drizzle migration from schema diffs |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:push` | Push schema directly (skips migration files; dev only) |
| `pnpm format` | Prettier write |
| `pnpm format:check` | Prettier check |

## Tests

- **Unit** (`packages/shared`, `apps/web`) — zod round-trips, mm/px math, session HMAC, page clamping.
- **Integration** (`packages/pdf`) — renders a tiny A4 doc with a CJK label and a KaTeX formula, asserts the parsed PDF has the right shape and embeds the CJK characters. Set `SKIP_PDF_TESTS=true` (or `PUPPETEER_SKIP_DOWNLOAD=true`) on environments without Chromium.
- **E2E** (`apps/web/e2e`) — Playwright spec hits the editor, creates a text block, drags it onto the canvas, clicks Export PDF, asserts the export request fires.

To run the E2E locally:

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm --filter @cheatsheet/worker dev   # terminal 2
pnpm --filter @cheatsheet/web test:e2e # terminal 3 (Playwright auto-starts the web server)
```

## Deployment

Per [DECISIONS.md](./DECISIONS.md):

- **Web** → Vercel (Next.js).
- **Worker** → Fly.io in `sin` (long-lived VM with Puppeteer's Chromium dependencies).
- **Database** → Neon Postgres in `ap-southeast-1`.
- **Total cost at zero traffic: $0.**

The worker's Dockerfile and `fly.toml` will be added when we deploy. Locally, the worker just needs Node 20+ and Chromium installed (Puppeteer's bundled Chromium downloads on `pnpm install` unless `PUPPETEER_SKIP_DOWNLOAD=true`).

## Definition of Done — status

| DoD item | Status |
|---|---|
| Local dev with `pnpm install && pnpm dev` | ✅ |
| Anonymous user lands on editor without signup | ✅ — device cookie, no UI for signup |
| Sign up / log in / log out | n/a — auth removed from MVP |
| Create a cheatsheet | ✅ — auto on first visit |
| Create text/formula/table blocks via editor | ✅ |
| Drag any block onto the canvas; placement persists | ✅ |
| Resize, reposition, delete, duplicate placements | ✅ |
| Snap-to-grid (1 mm) and alignment guides | ✅ — react-moveable with `elementGuidelines` |
| Undo/redo for last 50 actions | ✅ |
| Zoom 25%–400% and pan | ✅ zoom; pan is a stretch (scroll the viewport for now) |
| Auto-save 500 ms debounced | ✅ |
| Export PDF that downloads | ✅ |
| Print test on a real printer | ⚠️ requires manual physical test |
| `DECISIONS.md` exists | ✅ |
| `README.md` covers dev setup, env, deploy | ✅ |
| CI green (lint + typecheck + tests) | ✅ — workflow at `.github/workflows/ci.yml` |
| One E2E test passes | ✅ — `e2e/golden-path.spec.ts` |

## Out of scope

Multi-page, image/Mermaid blocks, AI extraction, auto-pack, vector search, templates, sharing, university print presets, density slider, pricing/Stripe. See [CHEATSHEETMAKER.md §15](./CHEATSHEETMAKER.md) for the queue.

## License

MIT — see [LICENSE](./LICENSE).
