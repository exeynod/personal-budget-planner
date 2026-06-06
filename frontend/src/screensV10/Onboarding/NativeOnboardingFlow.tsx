// Liquid Glass v2 — native iOS onboarding (single-scroll new-user setup).
//
// Web port of the iOS «Бюджет в одном касании» onboarding screen
// (.planning/ios-native-screens/00-onboarding.jpg). Rendered only for the
// not-onboarded path when `useShellVariant() === 'native'`; the Maximal
// Poster path (multi-step OnboardingFlow) is unchanged.
//
// CONTRACT — REUSED VERBATIM from the poster flow (no re-implementation):
//   1. POST /api/v1/me/consent  → grantConsent()      (idempotent ПДн grant)
//   2. POST /api/v1/onboarding/complete → postOnboardingComplete(serialiseDraft(draft))
//   The onboarding body is built from the SAME OnboardingDraft shape + the
//   SAME serialiseDraft() chokepoint the poster uses, so the wire payload is
//   byte-identical to the poster's (extra="forbid"; `pdn_consent` is NEVER in
//   the onboarding body — consent is a separate prior call).
//
// Server contract notes that shape this layout (app/api/schemas/onboarding_v10.py):
//   - income_cents MUST be > 0  → «Доход в месяц» is the required money field.
//   - accounts: min 1; account.balance_cents ∈ [-100M, 100M] ₽ → «Стартовый
//     баланс» allows 0 / negative (долг) per the reference subtitle. We seed a
//     single primary card account from it.
//   - category_plans Σ ≤ income → «Готовые категории» toggle seeds the 8
//     DEFAULT_CATEGORIES via defaultPlanFromIncome (already ≤ income), else {}.
//   - cycle_start_day is NOT part of the onboarding body (server hardcodes 1).
//     The «День начала бюджета» stepper is applied AFTER complete via the real
//     PATCH /settings endpoint (updateSettings), non-blocking.

import { useState } from 'react';
import {
  CurrencyRub,
  Minus,
  Plus,
  PaperPlaneTilt,
} from '@phosphor-icons/react';
import { grantConsent } from '../../api/me';
import { updateSettings } from '../../api/settings';
import { openTelegramLink } from '../../api/client';
import {
  postOnboardingComplete,
  serialiseDraft,
} from '../../api/onboardingV10';
import { DEFAULT_CATEGORIES, defaultPlanFromIncome } from './defaultCategories';
import type { OnboardingDraft } from './types';
import { formatMoneyNative } from '../native/money';
import styles from './NativeOnboardingFlow.module.css';

const BOT_USERNAME = 'tg_budget_planner_bot';

/** Cycle-start-day chips shown under the stepper (mirror of the reference). */
const CYCLE_CHIPS: ReadonlyArray<number> = [1, 5, 10, 15, 20, 25, 28];
const CYCLE_MIN = 1;
const CYCLE_MAX = 28;

export interface NativeOnboardingFlowProps {
  /** Called after a successful submit (or 409) so the host refetches /me. */
  onComplete: () => void;
}

/** Parse a rubles input string ("1 500", "−1 200,50") → integer cents.
 *  Allows a leading minus and 0; tolerant of grouping spaces + comma decimal. */
function parseRublesToCents(input: string): number {
  const cleaned = input
    .replace(/ | |\s/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const rub = Number.parseFloat(cleaned);
  if (!Number.isFinite(rub)) return 0;
  return Math.round(rub * 100);
}

export function NativeOnboardingFlow({
  onComplete,
}: NativeOnboardingFlowProps) {
  // «Доход в месяц» — required by the server (income_cents > 0).
  const [incomeInput, setIncomeInput] = useState('');
  // «Стартовый баланс» — account balance; 0 / negative (долг) allowed.
  const [balanceInput, setBalanceInput] = useState('');
  // «День начала бюджета» — applied via PATCH /settings post-complete.
  const [cycleDay, setCycleDay] = useState(1);
  // «Готовые категории» — seed the 8 default category plans.
  const [presetsOn, setPresetsOn] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const incomeCents = parseRublesToCents(incomeInput);
  const balanceCents = parseRublesToCents(balanceInput);
  const incomeValid = incomeCents > 0;

  function clampCycle(n: number): number {
    if (n < CYCLE_MIN) return CYCLE_MIN;
    if (n > CYCLE_MAX) return CYCLE_MAX;
    return n;
  }

  function openBot() {
    openTelegramLink(`https://t.me/${BOT_USERNAME}`);
  }

  async function onStart() {
    if (submitting) return;
    if (!incomeValid) {
      setErrorMsg('Укажите доход больше нуля');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);

    // Build the SAME draft shape the poster collects. `step` is UI-only and
    // stripped by serialiseDraft (never reaches the wire).
    const draft: OnboardingDraft = {
      step: 5,
      income_cents: incomeCents,
      accounts: [
        {
          bank: 'Счёт',
          mask: null,
          kind: 'card',
          balance_cents: balanceCents,
          primary: true,
        },
      ],
      category_plans: presetsOn ? defaultPlanFromIncome(incomeCents) : {},
      goal: null,
      savings_config: null,
    };

    try {
      // 1) Consent FIRST (idempotent; pdn_consent is NOT in the onboarding body).
      await grantConsent();
      // 2) Onboarding complete via the shared serialiser + poster API call.
      await postOnboardingComplete(serialiseDraft(draft));
      // 3) Apply cycle-start-day (separate, real endpoint; non-blocking).
      if (cycleDay !== 1) {
        try {
          await updateSettings({ cycle_start_day: cycleDay });
        } catch {
          // Cycle day is a post-onboarding preference — never block the
          // onboarded→Home transition on it. Owner can change it in Settings.
        }
      }
      onComplete();
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;
      if (status === 409) {
        // Already onboarded — let the host flip to Home.
        setErrorMsg('Вы уже завершили онбординг');
        setTimeout(() => onComplete(), 1500);
      } else if (status === 422) {
        setErrorMsg('Проверьте данные и попробуйте ещё раз');
      } else {
        setErrorMsg('Ошибка сети, попробуйте ещё раз');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.screen} data-testid="native-onboarding">
      <div className={styles.scroll}>
        {/* ── Hero ── */}
        <div className={styles.hero}>
          <span className={styles.heroIcon} aria-hidden="true">
            <CurrencyRub size={34} weight="bold" color="#fff" />
          </span>
          <h1 className={styles.title}>Бюджет в одном касании</h1>
          <p className={styles.subtitle}>
            Запиши траты, держи план, смотри тренды.
          </p>
        </div>

        {/* ── Доход в месяц (required > 0) ── */}
        <div className={styles.card}>
          <div className={styles.fieldRow}>
            <label htmlFor="onb-income" className={styles.fieldLabel}>
              Доход в месяц
            </label>
            <div className={styles.amountField}>
              <input
                id="onb-income"
                className={styles.amountInput}
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={incomeInput}
                onChange={(e) => setIncomeInput(e.target.value)}
                data-testid="native-onb-income"
              />
              <span className={styles.rub}>₽</span>
            </div>
          </div>
        </div>
        <p className={styles.caption}>Нужен для расчёта плана по категориям.</p>

        {/* ── Стартовый баланс (0 / negative allowed) ── */}
        <div className={styles.card}>
          <div className={styles.fieldRow}>
            <label htmlFor="onb-balance" className={styles.fieldLabel}>
              Стартовый баланс
            </label>
            <div className={styles.amountField}>
              <input
                id="onb-balance"
                className={styles.amountInput}
                type="text"
                inputMode="text"
                placeholder="0"
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
                data-testid="native-onb-balance"
              />
              <span className={styles.rub}>₽</span>
            </div>
          </div>
        </div>
        <p className={styles.caption}>
          Можно ввести 0 или отрицательное (долг).
        </p>

        {/* ── День начала бюджета (stepper + chips) ── */}
        <div className={styles.card}>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>День начала бюджета</span>
            <div className={styles.stepper}>
              <span
                className={styles.stepperValue}
                data-testid="native-onb-cycle"
              >
                {cycleDay}
              </span>
              <button
                type="button"
                className={styles.stepperBtn}
                aria-label="Уменьшить день"
                onClick={() => setCycleDay((d) => clampCycle(d - 1))}
              >
                <Minus size={18} weight="bold" />
              </button>
              <span className={styles.stepperDivider} aria-hidden="true" />
              <button
                type="button"
                className={styles.stepperBtn}
                aria-label="Увеличить день"
                onClick={() => setCycleDay((d) => clampCycle(d + 1))}
              >
                <Plus size={18} weight="bold" />
              </button>
            </div>
          </div>
          <div className={styles.chips} role="group" aria-label="День начала">
            {CYCLE_CHIPS.map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.chip} ${
                  cycleDay === d ? styles.chipActive : ''
                }`}
                aria-pressed={cycleDay === d}
                onClick={() => setCycleDay(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <p className={styles.caption}>Например, день зарплаты.</p>

        {/* ── Готовые категории (presets toggle) ── */}
        <div className={styles.card}>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Готовые категории</span>
            <button
              type="button"
              role="switch"
              aria-checked={presetsOn}
              aria-label="Готовые категории"
              className={`${styles.toggle} ${presetsOn ? styles.toggleOn : ''}`}
              onClick={() => setPresetsOn((v) => !v)}
              data-testid="native-onb-presets"
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
        </div>
        <p className={styles.caption}>
          Добавить {DEFAULT_CATEGORIES.length} преднастроенных категорий
          (Продукты, Дом, Транспорт и т.д.) — можно отредактировать позже.
        </p>

        {/* ── Telegram-бот ── */}
        <div className={styles.sectionLabel}>Telegram-бот</div>
        <button
          type="button"
          className={styles.botBtn}
          onClick={openBot}
          data-testid="native-onb-bot"
        >
          <PaperPlaneTilt size={18} weight="fill" />
          Открыть @{BOT_USERNAME}
        </button>
        <p className={styles.caption}>
          Нужен для напоминаний и быстрого ввода трат.
        </p>

        {errorMsg !== null && (
          <div className={styles.error} role="alert">
            {errorMsg}
          </div>
        )}
      </div>

      {/* ── «Начать» CTA (sticky footer) ── */}
      <div className={styles.footer}>
        <button
          type="button"
          className={`${styles.cta} ${
            !incomeValid || submitting ? styles.ctaDisabled : ''
          }`}
          onClick={onStart}
          disabled={!incomeValid || submitting}
          data-testid="native-onb-start"
        >
          {submitting
            ? 'Сохраняем…'
            : incomeValid
              ? `Начать · ${formatMoneyNative(incomeCents)} ₽/мес`
              : 'Начать'}
        </button>
      </div>
    </div>
  );
}
