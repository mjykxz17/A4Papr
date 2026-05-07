import { describe, expect, it } from 'vitest';
import { createConcurrencyLimit, QueueFullError } from './concurrency.js';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createConcurrencyLimit', () => {
  it('runs up to capacity tasks at once and queues the rest', async () => {
    const limit = createConcurrencyLimit(2);
    const a = deferred();
    const b = deferred();
    const c = deferred();

    const ra = limit(() => a.promise);
    const rb = limit(() => b.promise);
    const rc = limit(() => c.promise);

    // Yield so the limiter has a chance to schedule.
    await Promise.resolve();

    expect(limit.active()).toBe(2);
    expect(limit.pending()).toBe(1);

    a.resolve();
    await ra;
    // After 'a' settles, 'c' should start.
    await Promise.resolve();
    expect(limit.active()).toBe(2);
    expect(limit.pending()).toBe(0);

    b.resolve();
    c.resolve();
    await Promise.all([rb, rc]);
    expect(limit.active()).toBe(0);
  });

  it('rejects with QueueFullError when maxQueue is exceeded', async () => {
    const limit = createConcurrencyLimit(1, { maxQueue: 1 });
    const a = deferred();
    const b = deferred();

    const ra = limit(() => a.promise);
    const rb = limit(() => b.promise); // queues
    await expect(limit(() => Promise.resolve('c'))).rejects.toBeInstanceOf(QueueFullError);

    a.resolve();
    b.resolve();
    await Promise.all([ra, rb]);
  });

  it('drains the queue in FIFO order', async () => {
    const limit = createConcurrencyLimit(1);
    const order: string[] = [];

    const a = deferred();
    const ra = limit(async () => {
      await a.promise;
      order.push('a');
    });
    const rb = limit(async () => {
      order.push('b');
    });
    const rc = limit(async () => {
      order.push('c');
    });

    a.resolve();
    await Promise.all([ra, rb, rc]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('releases the slot even if the task throws', async () => {
    const limit = createConcurrencyLimit(1);
    await expect(limit(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(limit.active()).toBe(0);
    await expect(limit(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });
});
