// Phase 24-01: vitest specs for useOnboardingDraft (load/save/clear).
// Sanitiser-injection tests cover threat model T-24-01-01 / T-24-01-05.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useOnboardingDraft, STORAGE_KEY } from '../useOnboardingDraft';
import type { OnboardingDraft } from '../types';
import { INITIAL_STATE, onboardingReducer } from '../onboardingReducer';

function makeStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  } as Storage;
}

describe('useOnboardingDraft — basic round-trip', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorageStub());
  });

  it('save → load returns equal draft', () => {
    const hook = useOnboardingDraft();
    const draft: OnboardingDraft = onboardingReducer(INITIAL_STATE, {
      type: 'SET_INCOME',
      payload: { income_cents: 50_000_00 },
    });
    hook.save(draft);
    const loaded = hook.load();
    expect(loaded).toEqual(draft);
  });

  it('load() returns null when key absent', () => {
    const hook = useOnboardingDraft();
    expect(hook.load()).toBeNull();
  });

  it('clear() removes the persisted draft', () => {
    const hook = useOnboardingDraft();
    hook.save(INITIAL_STATE);
    expect(hook.load()).not.toBeNull();
    hook.clear();
    expect(hook.load()).toBeNull();
  });

  it('uses the documented storage key', () => {
    expect(STORAGE_KEY).toBe('onboarding.v10.draft');
  });
});

describe('useOnboardingDraft — sanitiser', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorageStub());
  });

  it('drops unknown top-level fields like __evil', () => {
    const malicious = {
      step: 1,
      income_cents: 0,
      accounts: [],
      category_plans: {},
      goal: null,
      savings_config: null,
      __evil: 'pwn',
      another: 42,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(malicious));
    const loaded = useOnboardingDraft().load();
    expect(loaded).not.toBeNull();
    // Type-narrow through cast — sanitiser must NOT preserve unknown keys.
    const obj = loaded as unknown as Record<string, unknown>;
    expect(obj.__evil).toBeUndefined();
    expect(obj.another).toBeUndefined();
    expect(Object.keys(obj).sort()).toEqual(
      ['accounts', 'category_plans', 'goal', 'income_cents', 'savings_config', 'step'].sort(),
    );
  });

  it('rejects entire payload when step out of 1..5 range (returns null)', () => {
    const bad = {
      step: 99,
      income_cents: 0,
      accounts: [],
      category_plans: {},
      goal: null,
      savings_config: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
    expect(useOnboardingDraft().load()).toBeNull();
  });

  it('rejects payload with non-array accounts', () => {
    const bad = {
      step: 1,
      income_cents: 0,
      accounts: 'not-an-array',
      category_plans: {},
      goal: null,
      savings_config: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
    expect(useOnboardingDraft().load()).toBeNull();
  });

  it('rejects payload with non-object category_plans', () => {
    const bad = {
      step: 1,
      income_cents: 0,
      accounts: [],
      category_plans: 'huh',
      goal: null,
      savings_config: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
    expect(useOnboardingDraft().load()).toBeNull();
  });

  it('drops unknown category_plans codes', () => {
    const dirty = {
      step: 1,
      income_cents: 0,
      accounts: [],
      category_plans: { food: 1000, gambling: 9999, cafe: 500 },
      goal: null,
      savings_config: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dirty));
    const loaded = useOnboardingDraft().load();
    expect(loaded?.category_plans).toEqual({ food: 1000, cafe: 500 });
    expect((loaded?.category_plans as Record<string, number>).gambling).toBeUndefined();
  });

  it('rejects malformed JSON and clears the bad key (T-24-01-04)', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const loaded = useOnboardingDraft().load();
    expect(loaded).toBeNull();
    // Sanitiser self-heals so next load returns null cleanly:
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rejects payload with goal of wrong shape', () => {
    const bad = {
      step: 1,
      income_cents: 0,
      accounts: [],
      category_plans: {},
      goal: { name: 'X' /* missing target_cents */ },
      savings_config: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
    expect(useOnboardingDraft().load()).toBeNull();
  });

  it('strips per-account unknown fields', () => {
    const dirty = {
      step: 1,
      income_cents: 0,
      accounts: [
        { bank: 'X', kind: 'card', balance_cents: 1, primary: true, evil: 'no' },
      ],
      category_plans: {},
      goal: null,
      savings_config: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dirty));
    const loaded = useOnboardingDraft().load();
    expect(loaded).not.toBeNull();
    const acct = loaded!.accounts[0] as unknown as Record<string, unknown>;
    expect(acct.evil).toBeUndefined();
    expect(acct.bank).toBe('X');
  });
});

describe('useOnboardingDraft — SSR safety', () => {
  it('no-ops gracefully when localStorage missing', () => {
    vi.stubGlobal('localStorage', undefined);
    const hook = useOnboardingDraft();
    expect(() => hook.save(INITIAL_STATE)).not.toThrow();
    expect(hook.load()).toBeNull();
    expect(() => hook.clear()).not.toThrow();
  });
});
