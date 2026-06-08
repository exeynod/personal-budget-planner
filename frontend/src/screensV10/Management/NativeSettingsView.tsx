// Liquid Glass v2 — native iOS Settings view.
//
// Faithful port of the iOS MainShell Settings detail
// (.planning/ios-native-screens/03-management): a pushed detail screen with a
// back nav-bar + grouped inset sections, iOS-style steppers / toggles and
// disclosure rows for the pickers.
//
// Pure presentational: consumes the SAME props the poster SettingsView receives
// (SettingsMount wires the data + handlers identically). No data logic is
// duplicated. Mirrors EVERY poster control 1:1:
//   - День начала цикла  (cycle_start_day 1..28)   → stepper
//   - Напоминать за дней (notify_days_before 0..30) → stepper
//   - AI авто-категоризация (enable_ai_categorization) → toggle
//   - AI лимит расходов (ai_spend_cap_cents)        → read-only
//
// Liquid Glass is the only web design now, so there is no theme picker and no
// Home-color picker (both were Maximal-Poster controls and have been removed).

import { memo, useEffect, useState } from 'react';
import { Minus, Plus } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { formatMoneyNative } from '../native/money';
import { getMeV10, updateIncome } from '../../api/me';
import styles from './NativeSettingsView.module.css';

export interface SettingsViewProps {
  cycle_start_day: number;
  notify_days_before: number;
  ai_categorization_enabled: boolean;
  ai_spend_cap_cents: number;
  loading: boolean;
  error: string | null;
  onChangeCycleDay: (d: number) => void;
  onChangeNotifyDays: (d: number) => void;
  onToggleAiCat: (enabled: boolean) => void;
  canPop: boolean;
  onBack: () => void;
  // v1.1 planning rework — «Привести остаток».
  /** Current computed balance in cents, or null while it loads / fails. */
  balanceNowCents?: number | null;
  /** Reconcile the balance to `targetCents` (writes a balancing adjustment). */
  onReconcileBalance?: (targetCents: number) => void;
  /** True while a reconcile request is in flight. */
  reconciling?: boolean;
}

const CYCLE_MIN = 1;
const CYCLE_MAX = 28;
const NOTIFY_MIN = 0;
const NOTIFY_MAX = 30;

// iOS-style ± stepper (mirrors the poster stepper logic / disabled bounds).
function Stepper({
  value,
  min,
  max,
  disabled,
  onDec,
  onInc,
  valueTestId,
  decLabel,
  incLabel,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onDec: () => void;
  onInc: () => void;
  valueTestId: string;
  decLabel: string;
  incLabel: string;
}) {
  return (
    <span className={styles.stepper}>
      <button
        type="button"
        className={styles.stepperBtn}
        onClick={onDec}
        disabled={disabled || value <= min}
        aria-label={decLabel}
      >
        <Minus size={16} weight="bold" />
      </button>
      <span className={styles.stepperValue} data-testid={valueTestId}>
        {value}
      </span>
      <button
        type="button"
        className={styles.stepperBtn}
        onClick={onInc}
        disabled={disabled || value >= max}
        aria-label={incLabel}
      >
        <Plus size={16} weight="bold" />
      </button>
    </span>
  );
}

// iOS-style switch driving a hidden checkbox (mirrors poster toggle semantics).
function Toggle({
  checked,
  disabled,
  onChange,
  testId,
  ariaLabel,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  testId: string;
  ariaLabel: string;
}) {
  return (
    <label
      className={`${styles.toggle} ${checked ? styles.toggleOn : ''} ${
        disabled ? styles.toggleDisabled : ''
      }`}
    >
      <input
        type="checkbox"
        className={styles.toggleInput}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
        aria-label={ariaLabel}
      />
      <span className={styles.toggleKnob} aria-hidden />
    </label>
  );
}

// rubles → cents (same semantics as NativePlanView / NativeTemplateView).
function rublesInputToCents(raw: string): number {
  const cleaned = raw
    .replace(/[\s  ]/g, '')
    .replace(',', '.')
    .replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return 0;
  const rub = Number.parseFloat(cleaned);
  if (!Number.isFinite(rub) || rub < 0) return 0;
  return Math.round(rub * 100);
}

// cents → editable rubles string (no ₽, no grouping) for the income input.
function centsToRublesInput(cents: number): string {
  const abs = Math.max(0, Math.trunc(cents));
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  return kop === 0 ? `${rub}` : `${rub},${kop.toString().padStart(2, '0')}`;
}

// «Месячный доход»: self-contained editor for app_user.income_cents. Reads the
// current value via GET /me and saves via PATCH /me (updateIncome — gt=0,
// ≤100M ₽). The «Осталось распределить» card on «План месяца» reads the same
// income_cents, so setting it here fixes the «strange negative» when it's unset.
//
// Self-contained (not threaded through SettingsMount props) so it owns its own
// load/save lifecycle without widening the presentational SettingsView contract.
function IncomeSection() {
  const [input, setInput] = useState('');
  const [currentCents, setCurrentCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMeV10()
      .then((me) => {
        if (cancelled) return;
        const cents = me.income_cents ?? null;
        setCurrentCents(cents);
        setInput(cents == null ? '' : centsToRublesInput(cents));
      })
      .catch(() => {
        /* leave empty — the field is still usable to set income */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const targetCents = rublesInputToCents(input);
  // Endpoint requires income_cents > 0; an empty/zero input can't be saved.
  const canSubmit =
    input.trim() !== '' && targetCents > 0 && !saving && !loading;

  async function handleSave() {
    if (!canSubmit) return;
    setSaving(true);
    setStatus(null);
    try {
      const me = await updateIncome(targetCents);
      const cents = me.income_cents ?? null;
      setCurrentCents(cents);
      setInput(cents == null ? '' : centsToRublesInput(cents));
      setStatus('✓ Доход сохранён');
    } catch (e) {
      setStatus(
        e instanceof Error ? `Ошибка: ${e.message}` : 'Не удалось сохранить',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SectionHeader>Доход</SectionHeader>
      <InsetGroup>
        <InsetRow
          title={<span className={styles.rowTitleWrap}>Текущий доход</span>}
          trailing={
            <span className={styles.readonly} data-testid="income-current">
              {loading
                ? '…'
                : currentCents == null
                  ? 'не указан'
                  : `${formatMoneyNative(currentCents)} ₽`}
            </span>
          }
          trailingMuted
        />
        <InsetRow
          title={<span className={styles.rowTitleWrap}>Месячный доход</span>}
          trailing={
            <span className={styles.reconcileInputWrap}>
              <input
                type="text"
                inputMode="decimal"
                className={styles.reconcileInput}
                placeholder="₽"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSave();
                }}
                aria-label="Месячный доход в рублях"
                data-testid="income-input"
              />
              <button
                type="button"
                className={styles.reconcileBtn}
                disabled={!canSubmit}
                onClick={() => void handleSave()}
                data-testid="income-submit"
              >
                {saving ? '…' : 'Сохранить'}
              </button>
            </span>
          }
        />
      </InsetGroup>
      {status && (
        <div className={styles.incomeStatus} data-testid="income-status">
          {status}
        </div>
      )}
    </>
  );
}

// «Привести остаток»: show the computed balance, let the owner enter their real
// balance, and write a balancing adjustment via onReconcileBalance.
function ReconcileSection({
  balanceNowCents,
  reconciling,
  onReconcileBalance,
}: {
  balanceNowCents: number | null | undefined;
  reconciling: boolean;
  onReconcileBalance: (targetCents: number) => void;
}) {
  const [input, setInput] = useState('');
  const targetCents = rublesInputToCents(input);
  const canSubmit = input.trim() !== '' && !reconciling;

  return (
    <>
      <SectionHeader>Остаток</SectionHeader>
      <InsetGroup>
        <InsetRow
          title={
            <span className={styles.rowTitleWrap}>
              Текущий расчётный остаток
            </span>
          }
          trailing={
            <span className={styles.readonly} data-testid="reconcile-current">
              {balanceNowCents == null
                ? '—'
                : `${formatMoneyNative(balanceNowCents)} ₽`}
            </span>
          }
          trailingMuted
        />
        <InsetRow
          title={<span className={styles.rowTitleWrap}>Реальный остаток</span>}
          trailing={
            <span className={styles.reconcileInputWrap}>
              <input
                type="text"
                inputMode="decimal"
                className={styles.reconcileInput}
                placeholder="₽"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label="Реальный остаток в рублях"
                data-testid="reconcile-input"
              />
              <button
                type="button"
                className={styles.reconcileBtn}
                disabled={!canSubmit}
                onClick={() => {
                  onReconcileBalance(targetCents);
                  setInput('');
                }}
                data-testid="reconcile-submit"
              >
                {reconciling ? '…' : 'Привести'}
              </button>
            </span>
          }
        />
      </InsetGroup>
    </>
  );
}

function NativeSettingsViewInner(props: SettingsViewProps) {
  const capRubles = Math.floor(props.ai_spend_cap_cents / 100);

  return (
    <div className={styles.root} data-testid="native-settings-view">
      <NativeNavBar title="Настройки" onBack={props.onBack} />

      {props.loading && (
        <div className={styles.banner} data-testid="native-settings-loading">
          Загрузка…
        </div>
      )}
      {props.error && (
        <div
          className={`${styles.banner} ${styles.bannerError}`}
          data-testid="native-settings-error"
        >
          {props.error}
        </div>
      )}

      {/* Период */}
      <SectionHeader>Период</SectionHeader>
      <InsetGroup>
        <InsetRow
          title={<span className={styles.rowTitleWrap}>День начала цикла</span>}
          trailing={
            <Stepper
              value={props.cycle_start_day}
              min={CYCLE_MIN}
              max={CYCLE_MAX}
              disabled={props.loading}
              decLabel="Уменьшить день начала цикла"
              incLabel="Увеличить день начала цикла"
              valueTestId="cycle-start-day-value"
              onDec={() =>
                props.onChangeCycleDay(
                  Math.max(CYCLE_MIN, props.cycle_start_day - 1),
                )
              }
              onInc={() =>
                props.onChangeCycleDay(
                  Math.min(CYCLE_MAX, props.cycle_start_day + 1),
                )
              }
            />
          }
        />
        <InsetRow
          title={
            <span className={styles.rowTitleWrap}>
              Напоминать за дней до подписки
            </span>
          }
          trailing={
            <Stepper
              value={props.notify_days_before}
              min={NOTIFY_MIN}
              max={NOTIFY_MAX}
              disabled={props.loading}
              decLabel="Уменьшить дни уведомления"
              incLabel="Увеличить дни уведомления"
              valueTestId="notify-days-value"
              onDec={() =>
                props.onChangeNotifyDays(
                  Math.max(NOTIFY_MIN, props.notify_days_before - 1),
                )
              }
              onInc={() =>
                props.onChangeNotifyDays(
                  Math.min(NOTIFY_MAX, props.notify_days_before + 1),
                )
              }
            />
          }
        />
      </InsetGroup>

      {/* AI */}
      <SectionHeader>AI</SectionHeader>
      <InsetGroup>
        <InsetRow
          title={
            <span className={styles.rowTitleWrap}>AI авто-категоризация</span>
          }
          trailing={
            <Toggle
              checked={props.ai_categorization_enabled}
              disabled={props.loading}
              onChange={props.onToggleAiCat}
              testId="ai-cat-toggle"
              ariaLabel="AI авто-категоризация"
            />
          }
        />
        <InsetRow
          title={<span className={styles.rowTitleWrap}>AI лимит расходов</span>}
          trailing={
            <span className={styles.readonly} data-testid="ai-cap-value">
              {capRubles.toLocaleString('ru-RU')} ₽
            </span>
          }
          trailingMuted
        />
      </InsetGroup>

      {/* Доход — «Месячный доход» editor (sets app_user.income_cents) */}
      <IncomeSection />

      {/* Остаток — «Привести остаток» (v1.1) */}
      {props.onReconcileBalance && (
        <ReconcileSection
          balanceNowCents={props.balanceNowCents}
          reconciling={props.reconciling ?? false}
          onReconcileBalance={props.onReconcileBalance}
        />
      )}
    </div>
  );
}

export const NativeSettingsView = memo(NativeSettingsViewInner);
