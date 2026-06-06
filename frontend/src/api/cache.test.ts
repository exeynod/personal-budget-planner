import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  getCached,
  seedCache,
  invalidate,
  clearCache,
  CACHE_KEYS,
  DEFAULT_TTL_MS,
} from './cache';

afterEach(() => {
  clearCache();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('getCached', () => {
  it('returns the fetched value and caches it within TTL', async () => {
    const fetcher = vi.fn().mockResolvedValue('v1');
    const a = await getCached('k', fetcher);
    const b = await getCached('k', fetcher);
    expect(a).toBe('v1');
    expect(b).toBe('v1');
    // Second read served from cache — fetcher called once.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('dedups concurrent identical requests into a single in-flight promise', async () => {
    let resolve!: (v: string) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );
    const p1 = getCached('k', fetcher);
    const p2 = getCached('k', fetcher);
    // Both calls join the SAME in-flight promise.
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve('shared');
    expect(await p1).toBe('shared');
    expect(await p2).toBe('shared');
  });

  it('re-fetches after TTL expiry', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    expect(await getCached('k', fetcher, { ttlMs: 100 })).toBe('first');
    vi.advanceTimersByTime(101);
    expect(await getCached('k', fetcher, { ttlMs: 100 })).toBe('second');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight promise on rejection so a retry re-fetches', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');
    await expect(getCached('k', fetcher)).rejects.toThrow('boom');
    // Retry actually re-invokes the fetcher (no stuck in-flight / stale entry).
    expect(await getCached('k', fetcher)).toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('seedCache', () => {
  it('serves a seeded value without invoking the fetcher', async () => {
    seedCache('k', 'seeded');
    const fetcher = vi.fn().mockResolvedValue('network');
    expect(await getCached('k', fetcher)).toBe('seeded');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('invalidate (no stale-after-mutation)', () => {
  it('drops an exact key so the next read re-fetches', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new');
    expect(await getCached('k', fetcher)).toBe('old');
    invalidate('k');
    expect(await getCached('k', fetcher)).toBe('new');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('drops a whole family by prefix', async () => {
    const f1 = vi.fn().mockResolvedValueOnce('a1').mockResolvedValueOnce('a2');
    const f2 = vi.fn().mockResolvedValueOnce('b1').mockResolvedValueOnce('b2');
    await getCached(CACHE_KEYS.actuals(5), f1);
    await getCached(CACHE_KEYS.actuals(6), f2);
    invalidate(CACHE_KEYS.actualsPrefix);
    expect(await getCached(CACHE_KEYS.actuals(5), f1)).toBe('a2');
    expect(await getCached(CACHE_KEYS.actuals(6), f2)).toBe('b2');
  });

  it('balance-family invalidation does not touch the actuals family', async () => {
    const bal = vi
      .fn()
      .mockResolvedValueOnce('bal1')
      .mockResolvedValueOnce('bal2');
    const act = vi.fn().mockResolvedValue('act1');
    await getCached(CACHE_KEYS.balance(5), bal);
    await getCached(CACHE_KEYS.actuals(5), act);
    invalidate(CACHE_KEYS.balancePrefix);
    expect(await getCached(CACHE_KEYS.balance(5), bal)).toBe('bal2');
    // Actuals untouched — still cached, fetcher not re-invoked.
    expect(await getCached(CACHE_KEYS.actuals(5), act)).toBe('act1');
    expect(act).toHaveBeenCalledTimes(1);
  });
});

describe('CACHE_KEYS', () => {
  it('separates active vs archived category lists', () => {
    expect(CACHE_KEYS.categories(false)).toBe('categories:active');
    expect(CACHE_KEYS.categories(true)).toBe('categories:all');
    expect(CACHE_KEYS.categories(false)).toMatch(
      new RegExp('^' + CACHE_KEYS.categoriesPrefix),
    );
  });

  it('exposes a sane default TTL', () => {
    expect(DEFAULT_TTL_MS).toBeGreaterThan(0);
  });
});
