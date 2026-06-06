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
//   - Цвет Home (homeColor)                          → disclosure → HomeColorPickerSheet
//   - Тема (theme)                                   → disclosure → ThemePickerSheet
//
// The «Тема» row is the CRITICAL control: it drives the same `onSelectTheme`
// (useTheme setter) as the poster, so picking «Maximal Poster» switches shells
// back instantly. We reuse the existing poster ThemePickerSheet / HomeColorPickerSheet
// components — both are self-contained bottom-sheets and theme-agnostic.

import { memo, useState } from 'react';
import { Minus, Plus } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { formatMoneyNative } from '../native/money';
import { homeColorCssValue, homeColorLabel } from '../Home/useHomeColor';
import { themeLabel } from '../common';
import { HomeColorPickerSheet } from './HomeColorPickerSheet';
import { ThemePickerSheet } from './ThemePickerSheet';
import type { SettingsViewProps } from './SettingsView';
import styles from './NativeSettingsView.module.css';

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
          title="Текущий расчётный остаток"
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
          title="Реальный остаток"
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
          title="День начала цикла"
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
          title="Напоминать за дней до подписки"
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
          title="AI авто-категоризация"
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
          title="AI лимит расходов"
          trailing={
            <span className={styles.readonly} data-testid="ai-cap-value">
              {capRubles.toLocaleString('ru-RU')} ₽
            </span>
          }
          trailingMuted
        />
      </InsetGroup>

      {/* Остаток — «Привести остаток» (v1.1) */}
      {props.onReconcileBalance && (
        <ReconcileSection
          balanceNowCents={props.balanceNowCents}
          reconciling={props.reconciling ?? false}
          onReconcileBalance={props.onReconcileBalance}
        />
      )}

      {/* Оформление */}
      <SectionHeader>Оформление</SectionHeader>
      <InsetGroup>
        <InsetRow
          testId="home-color-row"
          title="Цвет Home"
          trailing={
            <span className={styles.previewTrailing}>
              <span
                className={styles.colorSwatch}
                style={{ background: homeColorCssValue(props.homeColor) }}
                aria-hidden
              />
              <span className={styles.previewLabel}>
                {homeColorLabel(props.homeColor)}
              </span>
            </span>
          }
          chevron
          onClick={() => props.onTogglePicker(true)}
        />
        <InsetRow
          testId="theme-row"
          title="Дизайн"
          subtitle="Maximal Poster / Liquid Glass"
          trailing={
            <span className={styles.previewLabel}>
              {themeLabel(props.theme)}
            </span>
          }
          chevron
          onClick={() => props.onToggleThemePicker(true)}
        />
      </InsetGroup>

      <HomeColorPickerSheet
        isOpen={props.pickerOpen}
        current={props.homeColor}
        onSelect={props.onSelectHomeColor}
        onClose={() => props.onTogglePicker(false)}
      />

      <ThemePickerSheet
        isOpen={props.themePickerOpen}
        current={props.theme}
        onSelect={props.onSelectTheme}
        onClose={() => props.onToggleThemePicker(false)}
      />
    </div>
  );
}

export const NativeSettingsView = memo(NativeSettingsViewInner);
