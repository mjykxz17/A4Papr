# Stack Decisions

Locked choices for the CheatsheetMaker MVP. Each decision lists alternatives considered and why this one won.

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

Multi-page, image/Mermaid blocks, AI extraction, auto-pack, vector search, templates, sharing, university print presets, density slider, pricing/Stripe. Do not start without explicit approval.
