# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until the project hits 1.0, **breaking changes can land on minor versions**;
patch versions remain backwards-compatible bug fixes only.

## [Unreleased]

### Added (post-review hardening pass, second iteration)

- **Magic-link claim flow.** `auth_claims` + `auth_tokens` tables,
  `/api/auth/claim` and `/api/auth/verify` routes, "Save library…"
  modal in the toolbar. Email "delivery" prints the link to stderr
  until an SMTP transport is wired in (intentionally minimal — see
  ADR-007).
- **Image block type.** End-to-end: schema, BlockEditorModal upload UI,
  `/api/uploads` route with magic-byte MIME sniffing (PNG / JPEG /
  GIF / WEBP), content-addressed storage under
  `apps/web/public/uploads/`, `image_uploads` table for ownership.
- **Structured JSON logger.** No deps, lives in `apps/web/src/lib/logger.ts`
  and `apps/worker/src/logger.ts`. Edge middleware mints `x-request-id`
  on first request; route handlers carry it through every log line via
  `requestLogger(req)`.
- **`withRoute` wrapper.** Centralises session enforcement, CSRF
  Origin/Referer check, request-scoped logging, and error responses.
  Routes opt out explicitly via `{ requireSession: false, csrf: false }`.
- **Web-side CSRF.** All mutating routes reject mismatched Origin /
  Referer with 403; missing both → hard reject (defence in depth on
  top of `SameSite=Lax`).
- **JSON body size cap (`readJsonBody`).** Default 256 KB; placements
  patch raised to 1 MB; image upload to 5 MB; auth claim to 4 KB.
  Both Content-Length and streamed-byte path are capped.
- **/api/extract hardening.** Per-device token-bucket rate limit
  (default 5/min), explicit body cap (64 KB pre-Zod), and persistent
  usage logging via the new `ai_usage` table (input/cache/output
  tokens, status, duration).
- **/api/healthz on web.** Pings the DB; load-balancer-friendly
  (no session, no CSRF).
- **Worker concurrency cap.** `createConcurrencyLimit(N, { maxQueue })`
  in front of Puppeteer; defaults to 1 in flight, 8 queued, anything
  past gets a fast 503. Configurable via `RENDER_CONCURRENCY` and
  `RENDER_QUEUE_DEPTH`.
- **Keyboard accessibility on the canvas.** Selected placement is
  focusable (`role=button`, aria-label with mm coords), arrow keys
  nudge ±1mm (Shift = ±10mm), Enter / Space opens the editor.
- **Pure undo controller (`createUndoController`).** Logic split out
  of the `useUndoStack` hook so it can be unit-tested directly. New
  test suite covers every state transition.
- **CI E2E job.** Builds web + worker, installs Playwright Chromium,
  starts both servers, polls `/healthz`, runs `pnpm test:e2e`,
  uploads the report on failure.
- **Backup tooling.** `scripts/backup.sh` (custom-format `pg_dump`)
  and `scripts/restore.sh` (refuses to overwrite a populated DB
  unless `FORCE=1`). Documented in DECISIONS-ADR-010.
- **DECISIONS.md ADRs.** Eleven architecture-decision records covering
  positioning, worker model, CSRF, rate limit, concurrency, magic
  link, uploads, logger, backup, and the `withRoute` wrapper.

### Added (initial post-review hardening pass)

- Server-side A4 bounds validation for placements: writes that would
  put a block outside the printable area are rejected with HTTP 400,
  and surviving values are clamped via `normalisePlacement()` before
  insert/update.
- Typed environment configuration (`apps/web/src/lib/env.ts`,
  `apps/worker/src/env.ts`) — env vars are validated with Zod at boot,
  not on first request.
- Prompt-injection defence in the AI extraction route: lecture notes
  are wrapped in a `<student_notes>` tag, inner copies of that tag are
  neutralised, and the system prompt instructs the model to treat
  tagged content as untrusted data.
- Worker render timeout and per-IP token-bucket rate limiter — a stuck
  Puppeteer page can no longer pin a worker indefinitely, and a single
  client cannot exhaust the worker fleet.
- Worker integration tests (`apps/worker/src/app.test.ts`) covering
  auth, validation, rate-limiting, timeout, and renderer failure paths.
- API route validation tests (`apps/web/src/app/api/__tests__/`) for
  blocks, cheatsheets, placements, and extract.
- Auto-save status now distinguishes `offline` from `error`; the
  toolbar surfaces it as a coloured indicator with `role="status"`.
- Server-side mobile gate via User-Agent on `/editor/[id]` — phones
  no longer mount the editor at all (with an opt-in "continue anyway"
  cookie escape hatch for tablets / unusual UAs).
- Husky + lint-staged pre-commit hook running Prettier and ESLint
  on staged files only.
- CI now spins up Postgres 16 and applies Drizzle migrations before
  running tests.
- Additional `packages/pdf` integration tests covering CJK inside a
  LaTeX `\text{}`, mixed CJK/Latin tables, and malformed LaTeX
  fallback.
- Extended Playwright golden path: undo / redo via keyboard, plus
  PDF download is now downloaded and verified by magic-byte check.

### Changed

- Export route now uses an injectable `requestRender()` worker client
  with a configurable timeout (`WORKER_RENDER_TIMEOUT_MS`), returning
  504 on timeout and 502 on transport failure.
- Worker entrypoint (`apps/worker/src/index.ts`) split: HTTP routing
  factored into `apps/worker/src/app.ts` for testability.

### Security

- Hardened the `/api/extract` route against prompt injection (see
  Added).
- LICENSE copyright owner updated to "A4 Papr authors" reflecting the
  rebrand.

## Versioning policy

- **Pre-1.0** (current): MINOR may break, PATCH won't.
- **Post-1.0**: strict SemVer.
- All packages share the root version (synced bumps). When a breaking
  change is unavoidable, document the migration in this file under a
  dedicated "Migration" subsection.

## Release process (future, post-1.0)

1. Add a new `## [x.y.z] - YYYY-MM-DD` section above `## [Unreleased]`
   and move the unreleased entries into it.
2. Bump the `version` field in every workspace `package.json` (root,
   `apps/*`, `packages/*`) to keep them in lockstep.
3. Tag the commit `vx.y.z` and push. CI publishes the build artefacts.
