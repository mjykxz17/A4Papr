# Stack Decisions

Locked choices for the A4 Papr MVP. Each decision lists alternatives considered and why this one won.

## Frontend framework — **Next.js 15 (App Router)**

- TypeScript strict, React 19, server components for static shell, client components for the canvas.
- API routes for thin CRUD against Postgres; PDF generation lives in a separate worker (see below).
- Alternatives: Remix (smaller ecosystem for our use), Vite SPA + Hono (rejected: have to hand-roll routing/SSR for the marketing surface).

## Auth — **None in MVP** (device-cookie session)

- Per user direction, no users table. Every cheatsheet/block is keyed by a `device_id` UUID stored in a signed `httpOnly` cookie.
- Session cookie value is `<uuid>.<hmac>`; the server verifies HMAC with `SESSION_SECRET` on every request.
- Tradeoff: users lose work if they clear cookies or switch browsers. Acceptable for v1 because the product output is a printable PDF — once exported, the digital copy is secondary.
- Migration path: when we add real auth, claim flow attaches all rows with `device_id = X` to a new `user_id`.

## Canvas / drag-resize — **`moveable` + `react-selecto`** with custom render layer

- `moveable` provides drag, resize (8 handles), rotation, and snap/alignment guides out of the box and exposes mm-precise deltas.
- `react-selecto` for marquee selection (future), single-click selection wired manually for v1.
- Render layer is plain absolutely-positioned `<div>`s sized in mm via CSS variables; `moveable` mutates a ref and we round to 1mm before persisting.
- Alternatives:
  - `react-rnd` — no built-in alignment guides, would have to hand-roll snap-to-edges.
  - `tldraw` — too much (infinite canvas, own scene graph, hard to constrain to A4).
  - `Konva` — canvas-based render means we lose accessible HTML for KaTeX SVGs and have to re-implement text rendering twice (canvas + PDF).

## Math rendering — **KaTeX**

- Renders to SVG (vector for PDF) and HTML (for the canvas) from the same LaTeX source.
- MathJax rejected: slower, larger bundle, async render races our auto-save.

## PDF generation — **Puppeteer on a long-lived worker** (Fly.io)

- Worker exposes `POST /render` (shared-secret auth). Given a `cheatsheetId`, it spawns a headless Chromium, navigates to `${APP_URL}/print/:id`, sets viewport to A4 at 96dpi, calls `page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })`, returns the buffer.
- The web app already knows how to render a cheatsheet — the worker just reuses the canvas-render code via a `/print/:id` route with a print stylesheet (no UI chrome). Means one renderer to maintain, not two.
- Embeds Noto Sans + Noto Sans CJK SC in the print stylesheet; KaTeX's SVG output stays vector.
- Alternatives:
  - `@react-pdf/renderer` — would force re-implementing every block type (text/formula/table) twice. KaTeX integration is non-trivial.
  - `pdfkit` direct — most code, least leverage.
  - `wkhtmltopdf` — explicitly forbidden by spec (poor CJK).

## Database + ORM — **Postgres + Drizzle**

- Drizzle: SQL-first, typed, lightweight migrations, plays well with Postgres `jsonb` (we store `contentJson` as `jsonb`).
- Local dev via Docker Compose Postgres 16; production on Neon (`ap-southeast-1`) when we deploy.
- Alternatives: Prisma (heavier client, slower cold starts on serverless), Kysely (no migrations).

## Hosting — **Vercel (web) + Fly.io (worker) + Neon (db)**

- Vercel for the Next.js app: free tier covers MVP traffic, `iad1` or `sin1` region.
- Fly.io for the worker: persistent VM in `sin` region (no 10s timeout), shared 256MB instance is free-tier-adjacent and enough for Puppeteer in single-cheatsheet renders.
- Neon Postgres: free tier, `ap-southeast-1` region.
- Total cost at zero traffic: **$0**. Well under the SGD $20 ceiling.
- Aiden's T480s on Tailscale stays as a fallback if we hit free-tier limits.

## License — **MIT**

- Default for solo MVPs; permits future closed-source integration and contributors.

## Build & tooling

- Monorepo: pnpm workspaces + Turborepo for incremental builds and shared cache.
- TS strict + `noUncheckedIndexedAccess`.
- ESLint flat config, Prettier, EditorConfig.
- Vitest for unit/integration tests, Playwright for E2E.
- CI: GitHub Actions running lint + typecheck + test on push.

## Test strategy

- Unit: `packages/shared` zod schemas (round-trip valid/invalid fixtures), mm/px conversion edge cases (1mm = 3.7795px @ 96dpi, rounding behavior).
- Integration: `packages/pdf` produces a buffer, parses with `pdf-parse`, asserts page size 595.28×841.89pt (A4) and presence of expected text.
- E2E: Playwright spec lands on the editor, creates a text block, drags it onto the canvas, exports PDF, asserts the file downloads.

## Out of scope (carried from spec §15)

Multi-page, Mermaid blocks, auto-pack, vector search, templates, sharing, university print presets, density slider, pricing/Stripe. Do not start without explicit approval. (Image blocks and AI extraction landed during the post-MVP hardening pass — see ADRs 7–8.)

---

# Architectural Decision Records

The locked stack choices above describe what we picked. The records
below describe why we made specific architectural moves during
implementation. Add a new record with a fresh number whenever you make
a non-obvious choice; supersede rather than delete.

## ADR-001 — Transform-only positioning on the canvas (2026-04)

**Context.** We tried CSS `top`/`left` plus `transform: translate` for
canvas blocks, but `react-moveable`'s frame went stale after every
state update — the next drag would re-snap to the previous rect.

**Decision.** Positioning is purely via `transform: translate()` with
`top: 0; left: 0` always set. Moveable computes its frame from the
target's transform; with positioning at zero we get a coherent frame
across re-renders. Inner content scales separately so text/SVG zoom
together with the page.

**Consequences.** All canvas math goes through `pxPerMm = MM_TO_PX *
zoom`. New canvas elements must follow the same convention or
re-validate Moveable's behaviour. Documented at the top of `Canvas.tsx`.

## ADR-002 — Worker + browser reuse vs per-request browser (2026-04)

**Context.** Headless Chromium takes 2–3 s to cold-start. PDF export
is interactive, so cold-start latency is visible.

**Decision.** A long-lived Hono worker holds a single Puppeteer browser
open and reuses it across requests. The web tier proxies through
`/api/cheatsheets/:id/export` with a shared-secret bearer.

**Consequences.** Memory cost ~150 MB per worker; capped concurrency
(see ADR-005). A stuck page would otherwise pin the worker — mitigated
by `RENDER_TIMEOUT_MS` (45 s default) which 504s and lets the next
render proceed against a fresh page.

## ADR-003 — Drizzle migrations applied in CI before tests (2026-05)

**Context.** Without migrations applied to the test DB, route tests
that hit the DB fail with "relation does not exist" only when their
specific table is touched. We want failures to surface in CI's
schema-check step, not deep inside a flaky test.

**Decision.** CI's `check` job spins up Postgres 16, runs `pnpm
db:migrate`, then runs lint/typecheck/test in that order.

**Consequences.** ~10 s overhead per CI run, in exchange for catching
schema regressions immediately. Editing `schema.ts` requires running
`pnpm db:generate` locally — CI applies, doesn't generate.

## ADR-004 — Origin/Referer CSRF check vs a CSRF token (2026-05)

**Context.** Cookies are `SameSite=Lax`, which covers most
browser-driven attacks but leaves edge cases.

**Decision.** Strict `Origin` (with `Referer` fallback) check on all
mutating routes. Both must match `APP_URL` exactly; missing both is a
hard reject. No anti-CSRF token — adding one would require server
state and a CSRF-aware fetch wrapper without a proportionate threat
reduction at our scope.

**Consequences.** All mutating fetches must originate from the app.
Server-to-server callers (magic-link verify, future webhooks) opt out
via `csrf: false` in `withRoute`.

## ADR-005 — Token-bucket rate limiting in-process (2026-05)

**Context.** Both `/render` (worker) and `/api/extract` (web) need
per-key rate limits. We have one box per service for now.

**Decision.** A pure-JS in-memory token bucket lives in
`packages/shared/src/rate-limit.ts`, used by both apps. No Redis.

**Consequences.** Works for a single instance. Horizontal scaling
needs a Redis-backed implementation; the API is intentionally a
single `take(key): boolean` method so the swap is one file. Buckets
are pruned amortised at 1024 entries to keep memory bounded.

## ADR-006 — Worker concurrency cap with bounded queue (2026-05)

**Context.** A single Puppeteer browser serialises requests anyway,
but without an explicit concurrency cap a sudden spike in `/render`
calls grows latency unboundedly as requests await the same browser.

**Decision.** `RENDER_CONCURRENCY=1` (default) with `RENDER_QUEUE_DEPTH=8`.
Anything beyond the queue gets a fast 503; the web tier surfaces "try
again". The limiter lives in `apps/worker/src/concurrency.ts`.

**Consequences.** A burst of 9 simultaneous exports puts 1 in flight,
7 queued, 1 rejected. Tunable per-deploy. Multiple browser pools later
would raise the cap.

## ADR-007 — Magic-link claim, "log to stderr" delivery (2026-05)

**Context.** ADR-stack-Auth makes a cleared cookie equivalent to data
loss. We want a recovery path without building full auth in the MVP.

**Decision.** Add `auth_claims` (email → device_id) and `auth_tokens`
(one-time, 30-min TTL, 256-bit random) tables, plus
`/api/auth/claim` and `/api/auth/verify`. Email "delivery" is
`stderrDelivery` — the magic link prints to the server log.

**Consequences.** Production needs an SMTP transport; that's a single
function (`MagicLinkDelivery`) swap. `/api/auth/claim` does not
enumerate emails — every call returns a generic 200 regardless of
whether the email was already claimed.

## ADR-008 — Image uploads to `apps/web/public/uploads/`, content-addressed (2026-05)

**Context.** Image blocks need a place to put bytes the browser can
fetch by URL. We deliberately scoped this to the simplest thing that
works on a single host.

**Decision.** Files land at `apps/web/public/uploads/{sha256}.{ext}`
(gitignored). Next.js's static handler serves them. The
`image_uploads` table tracks ownership for cleanup and quota. MIME is
validated by **magic bytes**, not the client-supplied Content-Type.
SVG is rejected to avoid script-in-image XSS.

**Consequences.** URLs are content-addressed and unguessable (256 bits
of hash). No per-URL access control beyond that.
`output: 'standalone'` builds need extra wiring to ship runtime
uploads (the public dir is copied at build time). Production should
swap in object storage (S3/R2) — plan: a storage adapter with
filesystem and S3 backends.

## ADR-009 — Custom JSON logger, no `pino`/`bunyan` (2026-05)

**Context.** We want correlation IDs and structured fields without
paying for `pino` (large, Node-only) or `bunyan` (less actively
maintained).

**Decision.** A 30-line custom logger that writes one JSON object per
line via `console.{warn,error}` and `process.stdout.write`. Edge
middleware mints `x-request-id` on first request; route handlers
build a request-scoped child logger via `requestLogger(req)`.

**Consequences.** Every line is a valid JSON object — Loki, Datadog,
and `jq` all parse it natively. We give up pino's fast-path and
async-safe logging. For our traffic this is fine; revisit if hot
logging shows up in profiles.

## ADR-010 — Backups via `pg_dump` script, no automation (2026-05)

**Context.** The MVP has no managed backup story. A hosted Postgres
(Neon) provides PITR, but our development and self-hosted paths don't.

**Decision.** Add `scripts/backup.sh` (custom-format `pg_dump`) and
`scripts/restore.sh` (refuses to overwrite a populated DB unless
`FORCE=1`). Document this as the path for now. Explicit non-goals:
encryption, off-host upload, scheduling.

**Consequences.** Operationally still risky — production deploys must
wire `backup.sh` into a cron / systemd timer and ship dumps off-host
(encrypted). The script is intentionally tiny so it's auditable.

## ADR-011 — `withRoute` wrapper for cross-cutting concerns (2026-05)

**Context.** Every API route was repeating the same five steps:
read device cookie, return 401 if absent, parse JSON body, validate,
catch + log. Drift was inevitable.

**Decision.** A `withRoute(handler, options)` wrapper in
`apps/web/src/lib/route-helpers.ts` enforces session, CSRF, request
logging, and structured error responses. Routes opt out of session
(`requireSession: false`) or CSRF (`csrf: false`) explicitly.

**Consequences.** Every route now has uniform error shape and uniform
logs. Adding a new cross-cutting concern (e.g. tracing spans) is a
single-file change. Routes that don't need a session (`/healthz`,
magic-link verify) declare it explicitly.
