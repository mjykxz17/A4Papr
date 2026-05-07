/**
 * Thin client for the long-lived PDF render worker.
 *
 * Extracted from the export route so it can be unit-tested with a
 * stubbed `fetch`. The route stays a thin auth-and-stream wrapper.
 */

export interface WorkerRenderResult {
  ok: true;
  body: ReadableStream<Uint8Array>;
}

export interface WorkerErrorResult {
  ok: false;
  /** HTTP status to return to the original caller. */
  status: 502 | 504;
  message: string;
}

export type WorkerResult = WorkerRenderResult | WorkerErrorResult;

export interface WorkerClientOptions {
  workerUrl: string;
  sharedSecret: string;
  timeoutMs: number;
  /** Override `fetch` for tests. */
  fetchImpl?: typeof fetch;
}

export async function requestRender(
  args: { cheatsheetId: string; deviceId: string },
  opts: WorkerClientOptions,
): Promise<WorkerResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(`${opts.workerUrl}/render`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.sharedSecret}`,
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        status: 504,
        message: `PDF render timed out after ${opts.timeoutMs}ms`,
      };
    }
    return {
      ok: false,
      status: 502,
      message: `Worker unreachable: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      status: 502,
      message: `worker failed: ${res.status} ${text}`,
    };
  }
  if (!res.body) {
    return { ok: false, status: 502, message: 'worker returned no body' };
  }
  return { ok: true, body: res.body };
}
