/**
 * Parse a chatbot's markdown output into proposed cheatsheet blocks.
 *
 * Expected shape:
 *
 *   ## Heading
 *   [tags: probability, bayes]    (optional — also accepts *Tags: a, b*)
 *
 *   <body content>
 *
 * Block type is auto-detected from the body:
 *   - GFM table (`| ... | ... |` rows) → table block
 *   - `$$...$$` display math, or ```latex``` fence → formula block
 *   - everything else → text block (heading rendered as **bold** lead)
 *
 * Returns null when no `## ` heading is found, or when no blocks were
 * parseable — the caller surfaces that as an error.
 */

export type ProposedBlock =
  | {
      type: 'text';
      markdown: string;
      fontSize: 'sm';
      align: 'left';
      tags: string[];
      rationale: string;
    }
  | {
      type: 'formula';
      latex: string;
      displayMode: boolean;
      tags: string[];
      rationale: string;
    }
  | {
      type: 'table';
      headers: string[];
      rows: string[][];
      compact: boolean;
      headerStyle: 'bold';
      tags: string[];
      rationale: string;
    };

const TAG_LINE = /^\s*(?:\[tags?:\s*([^\]\n]+)\]|\*\*?Tags?:\s*([^*\n]+?)\*\*?)\s*$/im;

function extractTags(body: string): { body: string; tags: string[] } {
  const m = body.match(TAG_LINE);
  if (!m) return { body, tags: [] };
  const raw = (m[1] ?? m[2] ?? '').trim();
  const tags = raw
    .split(/[,;]/)
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 8);
  return { body: body.replace(m[0], '').trim(), tags };
}

function tryParseTable(body: string):
  | {
      type: 'table';
      headers: string[];
      rows: string[][];
      compact: boolean;
      headerStyle: 'bold';
    }
  | null {
  const lines = body.split('\n').map((l) => l.trim());
  const isRow = (l: string) => /\|/.test(l);
  const isSeparator = (l: string) =>
    /^\|?\s*:?-+:?(\s*\|\s*:?-+:?)+\s*\|?$/.test(l);

  let start = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (isRow(lines[i]!) && isSeparator(lines[i + 1]!)) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  const splitRow = (l: string) =>
    l
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());

  const headers = splitRow(lines[start]!);
  const rows: string[][] = [];
  for (let i = start + 2; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l || !isRow(l) || isSeparator(l)) break;
    const cells = splitRow(l);
    if (cells.length === 0 || cells.every((c) => c === '')) break;
    rows.push(cells);
  }
  if (headers.length < 2 || rows.length === 0) return null;
  return { type: 'table', headers, rows, compact: true, headerStyle: 'bold' };
}

function tryParseFormula(body: string):
  | { type: 'formula'; latex: string; displayMode: boolean }
  | null {
  const trimmed = body.trim();
  // $$...$$ display math, possibly multi-line
  const display = trimmed.match(/^\$\$([\s\S]+?)\$\$$/);
  if (display) {
    return { type: 'formula', latex: display[1]!.trim(), displayMode: true };
  }
  // ```latex / ```math fenced block
  const fenced = trimmed.match(/^```(?:latex|math|tex)?\s*\n([\s\S]+?)\n```$/i);
  if (fenced) {
    return { type: 'formula', latex: fenced[1]!.trim(), displayMode: true };
  }
  // Single inline $...$ alone on a line
  const inline = trimmed.match(/^\$([^$\n]+)\$$/);
  if (inline) {
    return { type: 'formula', latex: inline[1]!.trim(), displayMode: false };
  }
  return null;
}

export function parseMarkdownBlocks(text: string): { blocks: ProposedBlock[] } | null {
  const matches: Array<{ heading: string; start: number; end: number }> = [];
  for (const m of text.matchAll(/^##\s+(.+)$/gm)) {
    const idx = m.index ?? 0;
    matches.push({ heading: m[1]!.trim(), start: idx, end: idx + m[0].length });
  }
  if (matches.length === 0) return null;

  const blocks: ProposedBlock[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const next = matches[i + 1];
    const body = text.slice(cur.end, next ? next.start : text.length).trim();
    if (!body) continue;

    const { body: stripped, tags } = extractTags(body);
    const heading = cur.heading;
    const rationale = heading.length > 180 ? heading.slice(0, 180) : heading;

    const table = tryParseTable(stripped);
    if (table) {
      blocks.push({ ...table, tags, rationale });
      continue;
    }

    const formula = tryParseFormula(stripped);
    if (formula) {
      blocks.push({ ...formula, tags, rationale });
      continue;
    }

    // Default: text block. Heading rendered as bold lead so the
    // section title isn't lost.
    const md = `**${heading}**\n\n${stripped}`;
    const trimmed = md.length > 2000 ? md.slice(0, 2000) : md;
    blocks.push({
      type: 'text',
      markdown: trimmed,
      fontSize: 'sm',
      align: 'left',
      tags,
      rationale,
    });
  }

  return blocks.length > 0 ? { blocks } : null;
}
