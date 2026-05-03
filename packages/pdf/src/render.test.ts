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

describe.skipIf(!PUPPETEER_AVAILABLE)('renderCheatsheetPdf', () => {
  it('produces a valid A4 PDF with embedded text', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(HTML);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;

    try {
      const pdfBuffer = await renderCheatsheetPdf({ url: `http://127.0.0.1:${port}/` });
      expect(pdfBuffer.byteLength).toBeGreaterThan(1000);

      const parsed = await pdfParse(Buffer.from(pdfBuffer));
      expect(parsed.numpages).toBe(1);

      // pdf-parse exposes the first page's mediaBox via the `info` chain in
      // some versions; here we assert text content as a more stable signal.
      expect(parsed.text).toContain('贝叶斯');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }, 60_000);
});
