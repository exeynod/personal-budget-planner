// Thin, dependency-free client cache + in-flight request dedup.
//
// Motivation (perceived-speed): the v10 PosterRouter mounts only the
// top-of-stack entry, so every navigation freshly MOUNTS a screen that
// re-fetches the same stable cross-screen reads (accounts / categories /
// periods / actuals) from scratch — each flashing a full-screen loading
// plate. A Home → Transactions → CategoryDetail → back → Plan walk hits the
// same 4 endpoints 4+ times in seconds.
//
// This module wraps the STABLE reads behind a tiny Map-keyed cache so:
//   (a) a value is served instantly within its TTL (no cold round-trip),
//   (b) concurrent identical requests share ONE in-flight promise (dedup),
//   (c) callers can `invalidate(keyOrPrefix)` after a mutation so the next
//       read re-hits the network (NEVER serve stale balances after a write).
//
// Mutations are NEVER cached. The cache is keyed by a stable string; the
// caller owns the key convention (see CACHE_KEYS below). TTL is short by
// design — the cache is a perceived-speed aid, not a source of truth.

interface CacheEntry<T> {
  /** Resolved value (present once a fetch settled). */
  value: T;
  /** Epoch ms after which `value` is stale and must be re-fetched. */
  expiresAt: number;
}

interface CacheSlot {
  /** Settled entry — undefined until the first fetch resolves. */
  entry?: CacheEntry<unknown>;
  /** Single in-flight promise — dedups concurrent identical requests. */
  inFlight?: Promise<unknown>;
}

const store = new Map<string, CacheSlot>();

/** Default TTL for the stable list reads (accounts / categories / periods). */
export const DEFAULT_TTL_MS = 30_000;

export interface GetCachedOptions {
  /** Time-to-live in ms. Defaults to {@link DEFAULT_TTL_MS}. */
  ttlMs?: number;
}

/**
 * Return a cached value for `key` when fresh; otherwise invoke `fetcher`,
 * cache the result for `ttlMs`, and return it. Concurrent calls for the same
 * key share a single in-flight promise (request dedup) — only ONE network
 * round-trip fires even if five screens ask at once.
 *
 * On fetcher rejection the in-flight promise is cleared (so a retry actually
 * re-fetches) and the error propagates to every awaiting caller. A previously
 * cached fresh value is left intact only if it had not yet expired — but since
 * we only reach the fetcher when stale, a reject leaves the slot value-less.
 */
export function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: GetCachedOptions = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  const slot = store.get(key);

  // Fresh cached value → return immediately.
  if (slot?.entry && slot.entry.expiresAt > now) {
    return Promise.resolve(slot.entry.value as T);
  }

  // A request is already in flight for this key → join it (dedup).
  if (slot?.inFlight) {
    return slot.inFlight as Promise<T>;
  }

  // Cold (or stale) → fetch, store the in-flight promise so concurrent
  // callers dedup onto it.
  const nextSlot: CacheSlot = slot ?? {};
  const promise = fetcher()
    .then((value) => {
      // Only commit if this promise is still the active in-flight one — a
      // concurrent invalidate() may have cleared/replaced the slot.
      const live = store.get(key);
      if (live && live.inFlight === promise) {
        live.entry = { value, expiresAt: Date.now() + ttlMs };
        live.inFlight = undefined;
      }
      return value;
    })
    .catch((err) => {
      const live = store.get(key);
      if (live && live.inFlight === promise) {
        live.inFlight = undefined;
        // Drop any stale entry so a retry re-fetches rather than serving
        // expired data. If the slot now holds nothing, prune it entirely.
        if (!live.entry) store.delete(key);
      }
      throw err;
    });

  nextSlot.inFlight = promise;
  store.set(key, nextSlot);
  return promise;
}

/**
 * Pre-populate the cache for `key` with a known value (e.g. seeding the
 * per-screen reads from a `/home` bootstrap payload so the next navigation
 * reuses them with zero round-trips). Replaces any in-flight promise's
 * commit for the same key — a subsequent settle won't overwrite a fresher
 * seed because the in-flight guard checks promise identity.
 */
export function seedCache<T>(
  key: string,
  value: T,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  const slot = store.get(key) ?? {};
  slot.entry = { value, expiresAt: Date.now() + ttlMs };
  // Detach any in-flight promise from committing over this seed.
  slot.inFlight = undefined;
  store.set(key, slot);
}

/**
 * Invalidate cache entries. Pass an exact key to drop one entry, or a prefix
 * ending in ':' (or any substring match via prefix semantics) to drop a
 * family (e.g. `invalidate('actuals:')` clears every per-period actuals key).
 *
 * Invalidation drops BOTH the settled value and any in-flight promise so the
 * next read re-fetches — this is what guarantees no stale-after-mutation.
 */
export function invalidate(keyOrPrefix: string): void {
  // Exact-key fast path.
  if (store.has(keyOrPrefix) && !keyOrPrefix.endsWith(':')) {
    store.delete(keyOrPrefix);
    // Also fall through to prefix sweep below in case callers pass a key that
    // is also a prefix of others — but an exact non-':' key is unambiguous.
    return;
  }
  // Prefix sweep — drop every key that starts with the given string.
  for (const key of Array.from(store.keys())) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      store.delete(key);
    }
  }
}

/** Drop the entire cache (e.g. on logout / hard auth reset). */
export function clearCache(): void {
  store.clear();
}

/**
 * Stable cache-key builders — single source of truth so producers (seeding
 * from /home) and consumers (per-screen reads) agree byte-for-byte.
 */
export const CACHE_KEYS = {
  accounts: 'accounts',
  categories: (includeArchived: boolean) =>
    includeArchived ? 'categories:all' : 'categories:active',
  /** Prefix that matches BOTH categories:active and categories:all. */
  categoriesPrefix: 'categories:',
  periods: 'periods',
  me: 'me',
  actuals: (periodId: number) => `actuals:${periodId}`,
  actualsPrefix: 'actuals:',
  balance: (periodId: number) => `balance:${periodId}`,
  balancePrefix: 'balance:',
  /** Planned-rows list per period (v1.1 plan↔fact ladder). */
  planned: (periodId: number) => `planned:${periodId}`,
  /** Prefix matching every per-period planned key. */
  plannedPrefix: 'planned:',
} as const;
