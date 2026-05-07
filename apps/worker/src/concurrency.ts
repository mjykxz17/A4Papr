/**
 * Tiny FIFO semaphore. Caps the number of concurrent renders so a
 * single Puppeteer instance can't be overrun by simultaneous calls.
 *
 *   const limit = createConcurrencyLimit(2);
 *   await limit(async () => renderPdf(args));
 *
 * Tasks that arrive while at capacity wait in a FIFO queue; if `maxQueue`
 * is set and the queue is full, the limiter rejects with `QueueFullError`
 * so callers can return a 503 instead of letting the queue grow without
 * bound (which would translate to ever-rising latency under sustained
 * overload).
 */

export class QueueFullError extends Error {
  constructor() {
    super('render queue is full');
    this.name = 'QueueFullError';
  }
}

export interface ConcurrencyLimit {
  <T>(fn: () => Promise<T>): Promise<T>;
  /** Number of tasks running right now. */
  active(): number;
  /** Number of tasks waiting in the queue. */
  pending(): number;
}

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

export function createConcurrencyLimit(
  capacity: number,
  options: { maxQueue?: number } = {},
): ConcurrencyLimit {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error('concurrency capacity must be a positive integer');
  }
  const maxQueue = options.maxQueue ?? Infinity;
  let running = 0;
  const queue: Waiter[] = [];

  const drain = (): void => {
    if (running >= capacity) return;
    const next = queue.shift();
    if (!next) return;
    running++;
    next.resolve();
  };

  const limit: ConcurrencyLimit = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (running >= capacity) {
      if (queue.length >= maxQueue) {
        throw new QueueFullError();
      }
      await new Promise<void>((resolve, reject) => {
        queue.push({ resolve, reject });
      });
    } else {
      running++;
    }

    try {
      return await fn();
    } finally {
      running--;
      drain();
    }
  };

  limit.active = () => running;
  limit.pending = () => queue.length;
  return limit;
}
