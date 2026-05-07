# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until the project hits 1.0, **breaking changes can land on minor versions**;
patch versions remain backwards-compatible bug fixes only.

## [Unreleased]

### Added

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
