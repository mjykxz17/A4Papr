import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readDeviceId } from '@/lib/session';

/**
 * Lecture-note → cheatsheet blocks via Claude Sonnet 4.6.
 *
 * Uses messages.parse() with a Zod-typed output schema so the model
 * is constrained to return blocks that match the editor's content
 * shapes exactly. The system prompt is large and stable; we mark it
 * with cache_control so repeated extractions hit the prompt cache.
 *
 * Output is reviewed by the user before any block is persisted —
 * this route returns proposals only. The client POSTs accepted
 * blocks back through /api/blocks.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const ProposedTextBlock = z.object({
  type: z.literal('text'),
  markdown: z.string().min(1).max(2000),
  fontSize: z.enum(['xs', 'sm', 'base']).default('sm'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
  rationale: z.string().max(180).default(''),
});

const ProposedFormulaBlock = z.object({
  type: z.literal('formula'),
  latex: z.string().min(1).max(500),
  displayMode: z.boolean().default(true),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
  rationale: z.string().max(180).default(''),
});

const ProposedTableBlock = z.object({
  type: z.literal('table'),
  headers: z.array(z.string().min(1).max(80)).min(2).max(6),
  rows: z.array(z.array(z.string().max(120)).min(2).max(6)).max(15),
  compact: z.boolean().default(true),
  headerStyle: z.enum(['bold', 'shaded', 'none']).default('bold'),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
  rationale: z.string().max(180).default(''),
});

const ProposedBlock = z.discriminatedUnion('type', [
  ProposedTextBlock,
  ProposedFormulaBlock,
  ProposedTableBlock,
]);

const ExtractionOutput = z.object({
  blocks: z.array(ProposedBlock).max(20),
});

const RequestBody = z.object({
  text: z.string().min(20).max(50_000),
});

const SYSTEM_PROMPT = `You convert a student's lecture notes into a set of dense, exam-ready cheatsheet blocks for a print-ready A4 sheet. Each block is one of:

- text: a markdown snippet — concept + definition, mnemonic, principle. Bold/italic/inline code/bullets only. Max ~200 chars per block.
- formula: a single LaTeX equation rendered with KaTeX. Pick equations a student would want at a glance during an exam.
- table: structured comparisons or reference data. 2–6 columns, up to 15 rows, short cell values.

Hard rules:
1. Aim for 6–14 blocks per extraction. Quality over quantity. If notes are short, return fewer.
2. ONE concept per block. Don't bundle unrelated facts.
3. Skip filler ("important to remember…", "as we discussed", lecture metadata, page numbers, slide titles).
4. Preserve bilingual content verbatim — if notes contain Chinese + English, keep both.
5. LaTeX must be valid KaTeX (no \\begin{align*}, no custom macros, no \\usepackage). Use \\frac, \\sum, \\int, \\sqrt, ^{}, _{}, etc.
6. Tag each block with 2–4 short topic tags (lowercase, single word or hyphenated). Use the same tag for related blocks so the user can filter.
7. Provide a brief 'rationale' (≤ 1 short sentence) for why this block is worth carrying onto a cheatsheet — what's the moment of value during the exam.

Return ONLY blocks the student would meaningfully use. If the notes are too sparse to extract from, return an empty array.`;

export async function POST(req: Request) {
  const deviceId = await readDeviceId();
  if (!deviceId) {
    return NextResponse.json({ error: 'no session' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI extraction is disabled — ANTHROPIC_API_KEY is not configured' },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.parse({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract cheatsheet blocks from these lecture notes:' },
            { type: 'text', text: parsed.data.text },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ExtractionOutput) },
    });

    const result = response.parsed_output;
    if (!result) {
      return NextResponse.json(
        { error: 'extraction failed: no parsed output' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      blocks: result.blocks,
      usage: {
        inputTokens: response.usage.input_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        outputTokens: response.usage.output_tokens,
      },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'rate limited — try again shortly' }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Claude API error: ${err.message}` },
        { status: err.status ?? 502 },
      );
    }
    console.error('extract route failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'extraction failed' },
      { status: 500 },
    );
  }
}
