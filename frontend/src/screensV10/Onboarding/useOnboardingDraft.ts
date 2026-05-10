// Phase 24-01: localStorage persistence hook for onboarding draft.
// Threat model T-24-01-01/04/05: sanitiser whitelists known top-level
// fields, clamps step ∈ 1..5 (out-of-range → reject entire payload),
// drops unknown category_plans codes, validates account/goal shapes,
// self-heals malformed JSON by clearing the bad key.

import {
  VALID_CATEGORY_CODES,
  type DefaultCategoryCode,
} from './defaultCategories';
import type {
  AccountKind,
  OnboardingAccount,
  OnboardingDraft,
  OnboardingGoal,
  OnboardingSavingsConfig,
} from './types';

export const STORAGE_KEY = 'onboarding.v10.draft';

const ACCOUNT_KINDS: ReadonlySet<AccountKind> = new Set([
  'card',
  'cash',
  'savings',
]);
const SAVINGS_BASES: ReadonlySet<number> = new Set([10, 50, 100]);

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const ls = window.localStorage;
    if (!ls || typeof ls.getItem !== 'function') return null;
    return ls;
  } catch {
    return null;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitiseAccount(raw: unknown): OnboardingAccount | null {
  if (!isPlainObject(raw)) return null;
  const bank = raw.bank;
  const kind = raw.kind;
  const balance = raw.balance_cents;
  const primary = raw.primary;
  if (typeof bank !== 'string' || bank.length === 0) return null;
  if (typeof kind !== 'string' || !ACCOUNT_KINDS.has(kind as AccountKind)) return null;
  if (typeof balance !== 'number' || !Number.isFinite(balance)) return null;
  if (typeof primary !== 'boolean') return null;
  // mask is optional
  let mask: string | null = null;
  if (raw.mask !== undefined && raw.mask !== null) {
    if (typeof raw.mask !== 'string') return null;
    mask = raw.mask;
  }
  // Field-by-field copy guards against prototype pollution (T-24-01-05).
  return {
    bank,
    mask,
    kind: kind as AccountKind,
    balance_cents: balance,
    primary,
  };
}

function sanitiseGoal(raw: unknown): OnboardingGoal | null | 'invalid' {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return 'invalid';
  const name = raw.name;
  const target = raw.target_cents;
  if (typeof name !== 'string' || name.length === 0) return 'invalid';
  if (typeof target !== 'number' || !Number.isFinite(target)) return 'invalid';
  let due: string | null = null;
  if (raw.due !== undefined && raw.due !== null) {
    if (typeof raw.due !== 'string') return 'invalid';
    due = raw.due;
  }
  return { name, target_cents: target, due };
}

function sanitiseSavingsConfig(
  raw: unknown,
): OnboardingSavingsConfig | null | 'invalid' {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw)) return 'invalid';
  const enabled = raw.roundup_enabled;
  const base = raw.base;
  if (typeof enabled !== 'boolean') return 'invalid';
  if (typeof base !== 'number' || !SAVINGS_BASES.has(base)) return 'invalid';
  return {
    roundup_enabled: enabled,
    base: base as 10 | 50 | 100,
  };
}

function sanitisePlans(raw: unknown): Record<string, number> | null {
  if (!isPlainObject(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      continue;
    }
    if (!VALID_CATEGORY_CODES.has(key as DefaultCategoryCode)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Sanitises a parsed JSON blob into an OnboardingDraft, or returns null
 * when the payload is structurally unsafe (per T-24-01-01).
 */
function sanitiseDraft(raw: unknown): OnboardingDraft | null {
  if (!isPlainObject(raw)) return null;

  // step: must be int in 1..5; out-of-range rejects the whole payload.
  const step = raw.step;
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > 5) {
    return null;
  }

  const income = raw.income_cents;
  if (typeof income !== 'number' || !Number.isFinite(income) || income < 0) {
    return null;
  }

  // accounts: must be an array; each element must satisfy sanitiseAccount.
  if (!Array.isArray(raw.accounts)) return null;
  const accounts: OnboardingAccount[] = [];
  for (const a of raw.accounts) {
    const cleaned = sanitiseAccount(a);
    if (cleaned === null) return null; // strict — refuse to load with one bad row
    accounts.push(cleaned);
  }

  const plans = sanitisePlans(raw.category_plans);
  if (plans === null) return null;

  const goal = sanitiseGoal(raw.goal);
  if (goal === 'invalid') return null;

  const cfg = sanitiseSavingsConfig(raw.savings_config);
  if (cfg === 'invalid') return null;

  // Field-by-field copy to a fresh literal — defeats __proto__ injection.
  return {
    step: step as OnboardingDraft['step'],
    income_cents: income,
    accounts,
    category_plans: plans,
    goal,
    savings_config: cfg,
  };
}

export interface UseOnboardingDraftHook {
  load(): OnboardingDraft | null;
  save(state: OnboardingDraft): void;
  clear(): void;
}

export function useOnboardingDraft(): UseOnboardingDraftHook {
  return {
    load(): OnboardingDraft | null {
      const ls = safeStorage();
      if (!ls) return null;
      let raw: string | null;
      try {
        raw = ls.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
      if (raw === null) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // T-24-01-04: clear the corrupt key so future loads are clean.
        try {
          ls.removeItem(STORAGE_KEY);
        } catch {
          /* swallow */
        }
        return null;
      }
      return sanitiseDraft(parsed);
    },

    save(state: OnboardingDraft): void {
      const ls = safeStorage();
      if (!ls) return;
      try {
        ls.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        // Quota exceeded / serialisation error — log + drop.
        // eslint-disable-next-line no-console
        console.warn('[onboarding] draft save failed', err);
      }
    },

    clear(): void {
      const ls = safeStorage();
      if (!ls) return;
      try {
        ls.removeItem(STORAGE_KEY);
      } catch {
        /* swallow */
      }
    },
  };
}
