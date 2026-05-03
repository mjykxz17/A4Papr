/**
 * PDF rendering helpers, used by the worker.
 *
 * The worker boots a single shared Puppeteer browser instance, then
 * navigates it to the web app's `/print/:id` route to produce a PDF.
 * Doing the render in the same Chromium that already understands the
 * web app's CSS/KaTeX/Noto-CJK setup means we maintain one renderer.
 */
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer';
import { A4 } from '@cheatsheet/shared';

let _browser: Browser | undefined;

const DEFAULT_LAUNCH_OPTIONS: LaunchOptions = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--font-render-hinting=none',
  ],
};

export async function getBrowser(opts: LaunchOptions = DEFAULT_LAUNCH_OPTIONS): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;
  _browser = await puppeteer.launch(opts);
  return _browser;
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = undefined;
  }
}

export interface RenderOptions {
  /** Fully-qualified URL to /print/:id, including the worker shared secret. */
  url: string;
  /** Wait for KaTeX SVGs (and any other async pieces) to settle. */
  networkIdleTimeoutMs?: number;
}

/**
 * Render a cheatsheet at `url` to a PDF buffer. The page is expected
 * to render at exactly A4 — we configure Chromium to use the page's
 * own `@page` size (`preferCSSPageSize: true`) and never scale.
 */
export async function renderCheatsheetPdf(opts: RenderOptions): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Match A4 at 96 DPI so the print stylesheet maps 1:1 to the canvas.
    await page.setViewport({
      width: Math.ceil(A4.widthMm * 3.78),
      height: Math.ceil(A4.heightMm * 3.78),
      deviceScaleFactor: 2,
    });

    await page.goto(opts.url, {
      waitUntil: 'networkidle0',
      timeout: opts.networkIdleTimeoutMs ?? 30_000,
    });

    // KaTeX SVGs render synchronously on first paint, but give the
    // browser one frame to settle layout for very large tables.
    await page.evaluate(
      () =>
        new Promise<void>((r) => {
          // Browser-only API; this body runs inside the page context.
          const raf = (globalThis as unknown as {
            requestAnimationFrame: (cb: () => void) => void;
          }).requestAnimationFrame;
          raf(() => r());
        }),
    );

    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return buffer;
  } finally {
    await page.close();
  }
}
