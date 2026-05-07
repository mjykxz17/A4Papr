/**
 * Integration test for the Puppeteer renderer.
 *
 * Spins up a tiny static server that serves an A4-shaped HTML doc with
 * a KaTeX-rendered formula and a CJK-bearing label, renders it to PDF,
 * and asserts the output is a valid A4 PDF.
 *
 * Skipped automatically if Chromium isn't available locally
 * (PUPPETEER_SKIP_DOWNLOAD=true on CI without the browser).
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import pdfParse from 'pdf-parse';
import { closeBrowser, renderCheatsheetPdf } from './index.js';

const HTML = `<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css" crossorigin="anonymous" />
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; background: white; }
    .page { width: 210mm; height: 297mm; position: relative; }
    .label { position: absolute; left: 20mm; top: 20mm; font-size: 10pt; }
    .formula { position: absolute; left: 20mm; top: 40mm; font-size: 12pt; }
  </style>
</head><body>
  <div class="page">
    <div class="label">贝叶斯定理 — Bayes' theorem</div>
    <div class="formula" id="f"></div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
  <script>
    katex.render("P(A|B) = \\\\frac{P(B|A)P(A)}{P(B)}", document.getElementById("f"), {});
  </script>
</body></html>`;

const PUPPETEER_AVAILABLE =
  process.env.PUPPETEER_SKIP_DOWNLOAD !== 'true' && process.env.SKIP_PDF_TESTS !== 'true';

afterAll(async () => {
  await closeBrowser();
});

/**
 * Build an A4-shaped HTML doc that the renderer can navigate to. Each
 * test case crafts its own body so we can isolate KaTeX behaviours.
 */
function buildHtml(body: string, scripts: string[] = []): string {
  return `<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css" crossorigin="anonymous" />
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; background: white; }
    .page { width: 210mm; height: 297mm; position: relative; padding: 20mm; box-sizing: border-box; }
    .formula { margin: 8mm 0; font-size: 12pt; }
    .label { font-size: 10pt; }
    table { border-collapse: collapse; font-size: 9pt; }
    th, td { border: 1px solid #444; padding: 2mm 3mm; }
  </style>
</head><body>
  <div class="page">${body}</div>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js"></script>
  <script>${scripts.join('\n')}</script>
</body></html>`;
}

async function withStaticHtml<T>(html: string, fn: (url: string) => Promise<T>): Promise<T> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  try {
    return await fn(`http://127.0.0.1:${port}/`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

describe.skipIf(!PUPPETEER_AVAILABLE)('renderCheatsheetPdf', () => {
  it('produces a valid A4 PDF with embedded text (CJK label + KaTeX)', async () => {
    const pdfBuffer = await withStaticHtml(HTML, (url) => renderCheatsheetPdf({ url }));
    expect(pdfBuffer.byteLength).toBeGreaterThan(1000);

    const parsed = await pdfParse(Buffer.from(pdfBuffer));
    expect(parsed.numpages).toBe(1);
    expect(parsed.text).toContain('贝叶斯');
  }, 60_000);

  it('renders Chinese characters inside \\text{} in a LaTeX formula', async () => {
    const html = buildHtml(`<div class="formula" id="f"></div>`, [
      // \text{贝叶斯定理} embeds CJK inside KaTeX; if Noto-CJK isn't
      // wired up, this regresses to tofu in the resulting PDF.
      `katex.render("E = mc^2 \\\\quad \\\\text{贝叶斯定理}", document.getElementById("f"), { displayMode: true });`,
    ]);
    const pdfBuffer = await withStaticHtml(html, (url) => renderCheatsheetPdf({ url }));
    const parsed = await pdfParse(Buffer.from(pdfBuffer));
    expect(parsed.text).toContain('贝叶斯定理');
  }, 60_000);

  it('renders a table mixing CJK and Latin text', async () => {
    const html = buildHtml(`
      <div class="label">Comparison · 对比</div>
      <table>
        <thead><tr><th>Term</th><th>定义</th></tr></thead>
        <tbody>
          <tr><td>Posterior</td><td>后验概率</td></tr>
          <tr><td>Likelihood</td><td>似然度</td></tr>
        </tbody>
      </table>
    `);
    const pdfBuffer = await withStaticHtml(html, (url) => renderCheatsheetPdf({ url }));
    const parsed = await pdfParse(Buffer.from(pdfBuffer));
    expect(parsed.text).toContain('后验概率');
    expect(parsed.text).toContain('Posterior');
    expect(parsed.text).toContain('似然度');
  }, 60_000);

  it('does not crash on malformed LaTeX (KaTeX falls back to error markup)', async () => {
    // KaTeX with throwOnError:false renders broken LaTeX as red text;
    // the page should still produce a valid PDF rather than failing.
    const html = buildHtml(`<div class="formula" id="f"></div>`, [
      `try {
           katex.render("\\\\frac{1}{0}{{{", document.getElementById("f"), { throwOnError: false });
         } catch (e) {
           document.getElementById("f").textContent = "render-error: " + e.message;
         }`,
    ]);
    const pdfBuffer = await withStaticHtml(html, (url) => renderCheatsheetPdf({ url }));
    expect(pdfBuffer.byteLength).toBeGreaterThan(1000);
    const parsed = await pdfParse(Buffer.from(pdfBuffer));
    expect(parsed.numpages).toBe(1);
  }, 60_000);
});
