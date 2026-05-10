// Phase 24-08: Final view + atomic onboarding submit handler.
//
// Owns:
//   - Hero block: eyebrow «VOL.04 · ГОТОВО», Mass «ВСЁ.», DM Serif italic
//     subtitle «деньги — под контролем.»
//   - Summary plate (4 rows): ДОХОД / СЧЕТА / ПЛАН / ЦЕЛЬ
//   - «НАЧАТЬ →» CTA → POST /api/v1/onboarding/complete via
//     postOnboardingComplete(serialiseDraft(state))
//
// Status routing (per plan must_haves):
//   - 200 → draft.clear() then onComplete(response)
//   - 409 → draft.clear(); show «вы уже завершили онбординг»; after 1500ms
//     onComplete(null) so the host can transition out of onboarding
//   - 422 → show generic «Проверьте план…»; preserve draft; do NOT navigate
//   - network/other → generic «Ошибка сети, попробуйте ещё раз»
//
// Threat coverage:
//   - T-24-08-03 (replay): submitting state disables CTA + click guard
//   - T-24-08-04 (info disclosure): error copy is fixed russian, never echoes
//     raw err.message / err.body
//   - T-24-08-05 (logic flaw): 409 calls draft.clear() BEFORE onComplete

import { useState } from 'react';
import { Eyebrow, Mass, Toast } from '../../componentsV10';
import { useOnboardingDraft } from './useOnboardingDraft';
import { formatRubles } from './format';
import {
  postOnboardingComplete,
  serialiseDraft,
  type OnboardingV10Response,
} from '../../api/onboardingV10';
import type { OnboardingDraft } from './types';
import styles from './Final.module.css';

export interface FinalProps {
  /** Full draft state — used to render summary + serialise on submit. */
  state: OnboardingDraft;
  /**
   * Called after successful submit (200) with the server response, OR
   * after a 409 conflict (with `null`) once the toast has been shown.
   * 422 / network errors do NOT call onComplete — the user must retry.
   */
  onComplete: (response: OnboardingV10Response | null) => void;
}

/** Sum balance_cents across all accounts. */
function sumAccountBalances(state: OnboardingDraft): number {
  return state.accounts.reduce((s, a) => s + a.balance_cents, 0);
}

/** Sum category_plans values. */
function sumPlanCents(state: OnboardingDraft): number {
  return Object.values(state.category_plans).reduce((s, v) => s + v, 0);
}

/**
 * Extract HTTP status from a thrown apiFetch error. ApiError carries
 * `.status` directly; native errors (TypeError 'fetch failed') have no
 * status — return undefined so caller falls into the generic branch.
 */
function getStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: unknown }).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}

export function Final({ state, onComplete }: FinalProps) {
  const draft = useOnboardingDraft();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const incomeRubles = formatRubles(state.income_cents);
  const balancesRubles = formatRubles(sumAccountBalances(state));
  const planRubles = formatRubles(sumPlanCents(state));
  const goalLabel =
    state.goal === null
      ? 'без цели'
      : `${state.goal.name} · ${formatRubles(state.goal.target_cents)} ₽`;

  async function onStart() {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const body = serialiseDraft(state);
      const response = await postOnboardingComplete(body);
      draft.clear();
      onComplete(response);
    } catch (err) {
      const status = getStatus(err);
      if (status === 409) {
        // T-24-08-05: clear BEFORE delayed onComplete so a re-render between
        // the two callbacks never observes a stale draft.
        draft.clear();
        setErrorMsg('вы уже завершили онбординг');
        setTimeout(() => onComplete(null), 1500);
      } else if (status === 422) {
        setErrorMsg('Проверьте план: сумма не может превышать доход');
      } else {
        setErrorMsg('Ошибка сети, попробуйте ещё раз');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.final}>
      <div className={styles.hero}>
        <div className={styles.eyebrow}>
          <Eyebrow opacity={0.65}>VOL.04 · ГОТОВО</Eyebrow>
        </div>
        <Mass size={88}>ВСЁ.</Mass>
        <div className={styles.subtitle}>
          <Mass italic size={28}>
            деньги — под контролем.
          </Mass>
        </div>
      </div>

      <div className={styles.plate} role="list">
        <SummaryRow label="ДОХОД" value={`${incomeRubles} ₽ / мес`} />
        <SummaryRow
          label="СЧЕТА"
          value={`${state.accounts.length} · ${balancesRubles} ₽`}
        />
        <SummaryRow label="ПЛАН" value={`${planRubles} ₽ распределено`} />
        <SummaryRow label="ЦЕЛЬ" value={goalLabel} />
      </div>

      <button
        type="button"
        className={`${styles.cta}${submitting ? ' ' + styles.ctaDisabled : ''}`}
        onClick={onStart}
        disabled={submitting}
        aria-disabled={submitting}
      >
        НАЧАТЬ →
      </button>

      <Toast
        message={errorMsg ?? ''}
        visible={!!errorMsg}
        onDismiss={() => setErrorMsg(null)}
        duration={4000}
      />
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
}

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className={styles.row} role="listitem">
      <div className={styles.rowLabel}>
        <Eyebrow opacity={0.6}>{label}</Eyebrow>
      </div>
      <div className={styles.rowValue}>{value}</div>
    </div>
  );
}
