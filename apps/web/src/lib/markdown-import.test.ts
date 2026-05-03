import { describe, expect, it } from 'vitest';
import { parseMarkdownBlocks } from './markdown-import.js';

describe('parseMarkdownBlocks', () => {
  it('returns null when there are no `##` headings', () => {
    expect(parseMarkdownBlocks('Just a paragraph.')).toBeNull();
    expect(parseMarkdownBlocks('# H1 only')).toBeNull();
  });

  it('parses a text block with tags', () => {
    const md = `## Bayes' Theorem
[tags: probability, bayes]

Updates a prior P(A) given evidence B.`;
    const result = parseMarkdownBlocks(md);
    expect(result?.blocks).toHaveLength(1);
    const b = result!.blocks[0]!;
    expect(b.type).toBe('text');
    if (b.type !== 'text') throw new Error();
    expect(b.markdown).toContain('**Bayes');
    expect(b.markdown).toContain('Updates a prior');
    expect(b.tags).toEqual(['probability', 'bayes']);
    expect(b.rationale).toBe("Bayes' Theorem");
  });

  it('parses a $$...$$ display formula', () => {
    const md = `## Bayes equation

$$P(A|B) = \\frac{P(B|A) P(A)}{P(B)}$$`;
    const result = parseMarkdownBlocks(md);
    expect(result?.blocks).toHaveLength(1);
    const b = result!.blocks[0]!;
    expect(b.type).toBe('formula');
    if (b.type !== 'formula') throw new Error();
    expect(b.latex).toContain('\\frac');
    expect(b.displayMode).toBe(true);
  });

  it('parses a ```latex fenced formula', () => {
    const md = `## Quadratic

\`\`\`latex
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
\`\`\``;
    const result = parseMarkdownBlocks(md);
    const b = result!.blocks[0]!;
    expect(b.type).toBe('formula');
    if (b.type !== 'formula') throw new Error();
    expect(b.latex).toContain('\\sqrt');
    expect(b.displayMode).toBe(true);
  });

  it('parses a GFM table with bilingual content', () => {
    const md = `## Vocabulary
[tags: probability, vocab]

| 术语 | Symbol | Meaning |
| --- | --- | --- |
| 先验 | P(A) | prior probability |
| 似然 | P(B|A) | likelihood |
| 后验 | P(A|B) | posterior |`;
    const result = parseMarkdownBlocks(md);
    const b = result!.blocks[0]!;
    expect(b.type).toBe('table');
    if (b.type !== 'table') throw new Error();
    expect(b.headers).toEqual(['术语', 'Symbol', 'Meaning']);
    expect(b.rows).toHaveLength(3);
    expect(b.rows[0]).toEqual(['先验', 'P(A)', 'prior probability']);
    expect(b.tags).toEqual(['probability', 'vocab']);
  });

  it('parses multiple sections of mixed types', () => {
    const md = `## Bayes
Updates priors.

## Equation

$$P(A|B) = \\frac{P(B|A)P(A)}{P(B)}$$

## Vocab
| Term | Meaning |
| --- | --- |
| prior | initial belief |
| posterior | updated belief |`;
    const result = parseMarkdownBlocks(md);
    expect(result?.blocks).toHaveLength(3);
    expect(result!.blocks[0]!.type).toBe('text');
    expect(result!.blocks[1]!.type).toBe('formula');
    expect(result!.blocks[2]!.type).toBe('table');
  });

  it('skips empty sections', () => {
    const md = `## Empty section

## Real section
Content here.`;
    const result = parseMarkdownBlocks(md);
    expect(result?.blocks).toHaveLength(1);
    expect(result!.blocks[0]!.rationale).toBe('Real section');
  });

  it('extracts tags from a *Tags: ...* line as well', () => {
    const md = `## Topic
*Tags: a, b, c*

Body`;
    const result = parseMarkdownBlocks(md);
    expect(result!.blocks[0]!.tags).toEqual(['a', 'b', 'c']);
  });
});
