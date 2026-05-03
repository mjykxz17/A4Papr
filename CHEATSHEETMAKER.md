# CheatsheetMaker — MVP Scaffold Spec

> **For Claude Code:** Scaffold and build this MVP from an empty directory. Pick the stack you think best fits the requirements, justify the choice in `DECISIONS.md`, then build until the Definition of Done passes. Stop at "Out of scope" features and wait for review before extending.

## 1. What this is

CheatsheetMaker is a web tool for students to build print-ready exam cheatsheets by dragging "asset blocks" onto an A4 canvas.

The wedge: existing tools either generate sparse one-shot cheatsheets (MyLens, SlideSpeak) or use rigid grids (Cheatography). Neither lets students arrange dense, reusable concept blocks spatially the way they actually study. This product fills that gap.

This is a **standalone product**. Not a module of another platform. Not integrated into anything else. If it gets traction, it can be integrated later — that decision is not part of this build.

## 2. The MVP loop (must work end-to-end)

A user can:

1. Sign up and log in
2. Create a new cheatsheet
3. Build asset blocks (text, formula, table) — each editable
4. Drag blocks onto an A4 canvas
5. Resize, reposition, delete, duplicate blocks on the canvas
6. Have all changes persist (refresh page, work is still there)
7. Export the cheatsheet as a print-ready PDF
8. Print the PDF on a real A4 printer and have it look crisp

Anything that doesn't serve this loop is out of scope for v1.

## 3. Non-negotiable requirements

These constrain implementation choices.

1. **Print fidelity is the product.** PDFs must be vector-first, A4 (210×297mm), with crisp KaTeX-rendered formulas at 8pt. Test on a real printer, not just preview.
2. **Canvas must feel instant.** Drag, resize, snap-to-grid all run client-side. No server round-trip for spatial interactions.
3. **Single page only in v1.** One A4 sheet (front side). Multi-page and double-sided are v2.
4. **Persistence is mandatory.** Auto-save to backend on every meaningful change. Debounced, but never optional.
5. **Bilingual content support.** Block content may contain English, Simplified Chinese, or both. Fonts and KaTeX setup must handle CJK characters cleanly. Test with a Chinese formula label.
6. **Mobile is read-only.** Editing is desktop-only. Detect mobile and show a "view on desktop to edit" message. Don't waste time on touch drag handlers.
7. **Anonymous trial works.** A first-time visitor can build and export one cheatsheet without signing up. Account is required only to save more than one or to come back later. This matters for adoption.

## 4. Stack decision (you decide)

Pick the stack. Document choices in `DECISIONS.md` covering:

- Frontend framework
- Canvas/drag-resize library (suggested: react-rnd, dnd-kit + custom resize, tldraw, Konva, or moveable.js — each has tradeoffs)
- Math rendering (KaTeX strongly preferred over MathJax for performance)
- PDF generation (server-side; Puppeteer, react-pdf, pdfkit, or similar)
- Database + ORM
- Auth provider
- Hosting plan

**Constraints on the choice:**

- PDF generation must run server-side or in a long-lived process — not in a function that can time out at 10s. If using a serverless web tier, run PDF generation on a separate worker or use a "longer timeout" tier explicitly.
- Total infrastructure cost target: **under SGD $20/month at zero users**. Free tiers preferred.
- Singapore-region data hosting preferred (ap-southeast-1 or close). Reasoning: target users are SG students; latency and PDPA alignment both matter.

## 5. Domain model

Entities are fixed; field-level details are your call.

```
User
  - id, email, name, createdAt
  - hasMany Cheatsheets
  - hasMany Blocks (personal asset library)

Cheatsheet
  - id, userId (nullable for anonymous), title, paperSize ("A4"), orientation ("portrait")
  - createdAt, updatedAt
  - hasMany BlockPlacements

Block
  - id, userId (nullable for anonymous), type, contentJson, tags[]
  - type ∈ { "text", "formula", "table" } in v1
  - contentJson schema strictly typed per type (see section 6)
  - reusable across cheatsheets (a block can be placed on many cheatsheets)
  - "asset library" = the set of Blocks owned by a user

BlockPlacement
  - id, cheatsheetId, blockId
  - x, y, width, height — all in millimetres (not pixels, this matters for print)
  - rotation (degrees), zIndex (integer)
  - blockId is FK; the same block can appear in multiple cheatsheets
```

**Why blocks and placements are separate:** the asset block is the *concept* (e.g. "Bayes Theorem"). The placement is *where it sits on a specific cheatsheet*. The same block can be reused across multiple cheatsheets at different sizes and positions. This is the core data model insight that makes the asset-library mental model work.

## 6. Block content schemas (strict)

Each block stores `contentJson` matching its type. Validate with zod at every boundary.

```ts
// type: "text"
{
  markdown: string,           // GFM subset; bold, italic, lists, inline code
  fontSize: "xs" | "sm" | "base",  // 7pt, 8pt, 10pt at 100% zoom
  align: "left" | "center" | "right"
}

// type: "formula"
{
  latex: string,              // Rendered with KaTeX
  displayMode: boolean        // true = display style, false = inline
}

// type: "table"
{
  headers: string[],
  rows: string[][],
  compact: boolean,           // tighter padding when true
  headerStyle: "bold" | "shaded" | "none"
}
```

Validation rules:
- text markdown: max 2000 chars
- formula latex: max 500 chars, must round-trip through KaTeX without throwing
- table: max 12 columns, max 30 rows

## 7. The canvas

This is the heart of the product. Spend time getting it right.

**Coordinate system:** millimetres on A4 (210×297). All positions, sizes stored in mm. Render-time conversion to pixels based on zoom level.

**Required interactions:**

| Interaction | Behaviour |
|---|---|
| Drag block from sidebar onto canvas | Block placement created at drop point |
| Click block on canvas | Selection — shows resize handles + delete/duplicate buttons |
| Drag selected block | Repositions; snaps to 1mm grid; alignment guides appear when edges align with other blocks |
| Resize selected block | 8 handles (corners + edge midpoints); content reflows; aspect lock with shift |
| Delete key on selected block | Removes placement (block remains in library) |
| Cmd/Ctrl+D on selected block | Duplicates placement at +5mm offset |
| Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z | Undo / redo (last 50 actions) |
| Cmd/Ctrl+Plus / Minus / 0 | Zoom in / out / reset |
| Space + drag | Pan the canvas |
| Right-click block | Context menu: bring to front, send to back, edit content, delete |

**Visual requirements:**

- A4 paper rendered with subtle drop shadow on a neutral background
- 5mm margin guide rendered as a faint dashed rectangle (printable area)
- Snap-to-grid at 1mm; alignment guides (cyan lines) when block edges align with another block's edges
- Selection chrome (handles, outline) renders *outside* the block so it doesn't affect content layout
- Zoom range: 25% to 400%

## 8. The asset block sidebar

Left sidebar lists the user's blocks (asset library).

- Search box (filters by tag and content)
- Filter chips by type (text / formula / table / all)
- Each block shown as a small preview card
- "+ New block" button at the top opens a block editor modal
- Drag from sidebar to canvas creates a placement
- Right-click on a sidebar block: edit, delete, duplicate

The block editor modal:
- Type selector (text / formula / table)
- Type-specific editor (markdown editor for text, LaTeX input with live preview for formula, grid editor for table)
- Tag input
- Save creates/updates the block; if the block is placed on the current cheatsheet, the placement re-renders

## 9. PDF export contract

Server-side render. Endpoint takes `cheatsheetId`, returns a PDF.

Requirements:
- Page size: 210 × 297 mm exactly (A4)
- Default margin: 5mm (configurable per cheatsheet, future)
- Block rendering matches canvas WYSIWYG within 1mm tolerance
- Formulas rendered via KaTeX → SVG (vector, never raster)
- Tables rendered as native PDF tables with proper borders and padding
- Text uses an embedded font that supports CJK (e.g. Noto Sans CJK SC)
- Output filename: `{cheatsheetTitle}_{YYYYMMDD}.pdf`

**Do not use:**
- `wkhtmltopdf` (legacy, poor CJK)
- HTML-to-image converters (rasters everything)
- Any "headless Chrome as a service" wrapper that adds a network hop

**Acceptable approaches:**
- Puppeteer/Playwright running locally on the worker, with a print stylesheet that matches the canvas
- `react-pdf` (@react-pdf/renderer) with custom KaTeX-to-SVG integration
- Direct PDFKit composition (most control, most code)

Pick one, justify it.

## 10. Anonymous mode

A new visitor lands on the site, clicks "Try it now", and gets dropped straight into the editor with no signup.

- Cheatsheet stored against a session cookie (not localStorage — we want to persist across tabs)
- Anonymous user can create up to 1 cheatsheet, ~10 blocks
- "Save" or "Export" prompts signup with a friendly modal: "Sign up to keep this cheatsheet and unlock unlimited blocks"
- On signup, anonymous cheatsheet/blocks transfer to the new account

This is the single most important UX decision in the product. Don't gate the canvas behind auth.

## 11. Architecture (target shape)

```
┌─────────────────────────┐
│   Web app (Vercel)      │
│  - UI, canvas           │
│  - auth                 │
│  - thin API routes      │
└──────────┬──────────────┘
           │ writes
           ▼
   ┌──────────────┐         ┌───────────────────────┐
   │   Postgres   │◄────────│  Worker (Fly/Railway) │
   │              │ reads   │  - PDF rendering      │
   └──────────────┘ writes  └───────────────────────┘
           ▲
           │ presigned URL (uploads later)
           ▼
   ┌──────────────┐
   │  Object store│
   │  (R2/S3)     │
   └──────────────┘
```

Web tier and worker tier deploy separately. Web is short-lived/serverless friendly; worker is long-lived for PDF rendering.

## 12. Code quality bar

- TypeScript strict mode on
- ESLint + Prettier configured, enforced in CI
- Zod for all external data validation (API inputs, DB JSON columns)
- Postgres migrations versioned (Prisma migrate, Drizzle migrate, or chosen ORM equivalent)
- Environment variables documented in `.env.example`, never committed
- Tests:
  - Unit tests for block content validators (zod schemas)
  - Unit tests for mm-to-pixel conversion utilities
  - Integration test for PDF export (renders, opens, has expected page size)
  - One E2E test (Playwright): sign up → create text block → drag onto canvas → export PDF
- No `console.log` or commented-out code in committed files

## 13. Repo layout (suggested, adjust as needed)

```
/
├── apps/
│   ├── web/          # Next.js or chosen framework
│   └── worker/       # PDF rendering
├── packages/
│   ├── db/           # Schema, migrations, client
│   ├── shared/       # Block schemas (zod), types, mm/px utils
│   └── pdf/          # PDF rendering logic (used by worker)
├── DECISIONS.md      # Stack rationale, written by you
├── README.md         # Local dev, env vars, deploy
├── .env.example
└── package.json
```

Monorepo via pnpm workspaces or Turborepo.

## 14. Definition of Done

The MVP is complete when **all** of these are true:

- [ ] Repo runs locally with `pnpm install && pnpm dev` (or chosen equivalent)
- [ ] Anonymous user can land on the editor without signup, build, and export one cheatsheet
- [ ] User can sign up, log in, log out
- [ ] User can create a cheatsheet
- [ ] User can create text, formula, and table blocks with the block editor
- [ ] User can drag any block onto the A4 canvas; placement persists
- [ ] User can resize, reposition, delete, duplicate placements
- [ ] Snap-to-grid (1mm) and alignment guides work
- [ ] Undo/redo work for the last 50 actions
- [ ] Zoom (25% to 400%) and pan (space+drag) work
- [ ] Canvas auto-saves on every meaningful change (debounced 500ms)
- [ ] User can export the cheatsheet to PDF and the file downloads
- [ ] **Print test passes**: print the exported PDF on a real printer; formulas crisp at 8pt; CJK characters render correctly; layout matches canvas within 1mm
- [ ] `DECISIONS.md` exists and explains every stack choice
- [ ] `README.md` covers local dev setup, env vars, deployment
- [ ] CI pipeline green (lint + typecheck + tests)
- [ ] One E2E test passes

## 15. Out of scope (do not build, list only)

After the MVP is reviewed and approved, in priority order:

1. Multi-page cheatsheets (front + back of A4)
2. Image and Mermaid block types
3. AI extraction from uploaded PDFs (this is where SCOPE integration eventually lives)
4. Auto-pack ("fit these blocks with minimum whitespace")
5. Block library search-by-content (vector search)
6. Templates / starter cheatsheets per topic
7. Sharing (read-only public link to a cheatsheet)
8. Print-margin presets per university (NUS / NTU / SMU)
9. Density slider
10. Free/Pro pricing logic and Stripe integration

Stop at the MVP. Do not start any of these without explicit approval.

## 16. Questions to flag, not assume

If any of these are ambiguous, **ask before building**:

- Auth provider preference (Clerk, Supabase Auth, Auth.js, custom)?
- Canvas/drag library: react-rnd is simplest, tldraw richest, Konva most flexible. Which tradeoff?
- PDF generator: Puppeteer (HTML/CSS reuse, larger worker) or react-pdf (smaller, more code)?
- Worker hosting: Fly.io or Railway? (Aiden has a T480s on Tailscale as backup option.)
- Should I provision real cloud accounts now, or use local Postgres for everything until ready to deploy?
- License: MIT, AGPL, or proprietary?

Default to asking when uncertain. Do not silently choose for me on these six.

## 17. Domain & branding (for now)

- Working name: CheatsheetMaker
- No branding work needed in v1
- Use a neutral colour palette (slate + one accent) — final design comes after MVP validation
- Favicon: a simple A4 paper icon is fine

---

**Working directory convention:** all code under the repo root. Do not write files outside the repo. Do not modify global config (`~/.zshrc`, etc.). If you need a tool installed (e.g. Chromium for Puppeteer), document it in `README.md`.

**Commit convention:** Conventional Commits. One scoped commit per logical unit of work. Do not squash everything into a single "scaffold" commit — read the history matters for review.

**When in doubt, stop and ask.** Better to wait for clarification than to build the wrong thing well.
