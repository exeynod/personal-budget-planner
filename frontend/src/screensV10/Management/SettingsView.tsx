// Phase 27-06 Task 2: SettingsView (paper) — poster-styled settings form.
//
// Pure presentational. Re-styles the v0.6 SettingsScreen form fields:
//   - День начала цикла (cycle_start_day, 1..28) → stepper
//   - Напоминать за дней (notify_days_before, 0..30) → stepper
//   - AI авто-категоризация (ai_categorization_enabled) → toggle
//   - AI лимит расходов (ai_spend_cap_cents) → read-only display
//
// View is router-agnostic — all interactions / data passed via props.

import { Eyebrow, Mass } from '../../componentsV10';
import {
  homeColorCssValue,
  homeColorLabel,
  type HomeColor,
} from '../Home/useHomeColor';
import { themeLabel, type Theme } from '../common';
import { HomeColorPickerSheet } from './HomeColorPickerSheet';
import { ThemePickerSheet } from './ThemePickerSheet';
import styles from './SettingsView.module.css';

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
  // Phase 30-07 (DEBT-08): Home background color picker.
  homeColor: HomeColor;
  pickerOpen: boolean;
  onSelectHomeColor: (c: HomeColor) => void;
  onTogglePicker: (open: boolean) => void;
  // Phase 54-01 (LG-SW-02 web): Theme picker.
  theme: Theme;
  themePickerOpen: boolean;
  onSelectTheme: (t: Theme) => void;
  onToggleThemePicker: (open: boolean) => void;
  // v1.1 planning rework — «Привести остаток» (native shell only).
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

export function SettingsView(props: SettingsViewProps) {
  const capRubles = Math.floor(props.ai_spend_cap_cents / 100);

  return (
    <div className={styles.root} data-testid="settings-view">
      <div className={styles.headerRow}>
        {props.canPop && (
          <button
            type="button"
            className={styles.backLink}
            onClick={props.onBack}
          >
            ← НАЗАД
          </button>
        )}
      </div>

      <div className={styles.eyebrowRow}>
        <Eyebrow color="var(--poster-ink, #0E0E0E)">
          SETTINGS / НАСТРОЙКИ
        </Eyebrow>
      </div>

      <Mass italic size={56} className={styles.headlineMass}>
        Настройки.
      </Mass>

      {props.loading && (
        <div className={styles.loadingBanner} data-testid="settings-loading">
          Загрузка…
        </div>
      )}
      {props.error && (
        <div className={styles.errorBanner} data-testid="settings-error">
          {props.error}
        </div>
      )}

      <div className={styles.list}>
        {/* Row 1: cycle_start_day stepper */}
        <div className={styles.row}>
          <Eyebrow color="var(--poster-ink, #0E0E0E)">
            День начала цикла
          </Eyebrow>
          <div className={styles.rowControl}>
            <button
              type="button"
              className={styles.stepperBtn}
              onClick={() =>
                props.onChangeCycleDay(
                  Math.max(CYCLE_MIN, props.cycle_start_day - 1),
                )
              }
              disabled={props.cycle_start_day <= CYCLE_MIN || props.loading}
              aria-label="Уменьшить день начала цикла"
            >
              −
            </button>
            <span
              className={styles.stepperValue}
              data-testid="cycle-start-day-value"
            >
              {props.cycle_start_day}
            </span>
            <button
              type="button"
              className={styles.stepperBtn}
              onClick={() =>
                props.onChangeCycleDay(
                  Math.min(CYCLE_MAX, props.cycle_start_day + 1),
                )
              }
              disabled={props.cycle_start_day >= CYCLE_MAX || props.loading}
              aria-label="Увеличить день начала цикла"
            >
              +
            </button>
          </div>
        </div>

        {/* Row 2: notify_days_before stepper */}
        <div className={styles.row}>
          <Eyebrow color="var(--poster-ink, #0E0E0E)">
            Напоминать за дней до подписки
          </Eyebrow>
          <div className={styles.rowControl}>
            <button
              type="button"
              className={styles.stepperBtn}
              onClick={() =>
                props.onChangeNotifyDays(
                  Math.max(NOTIFY_MIN, props.notify_days_before - 1),
                )
              }
              disabled={props.notify_days_before <= NOTIFY_MIN || props.loading}
              aria-label="Уменьшить дни уведомления"
            >
              −
            </button>
            <span
              className={styles.stepperValue}
              data-testid="notify-days-value"
            >
              {props.notify_days_before}
            </span>
            <button
              type="button"
              className={styles.stepperBtn}
              onClick={() =>
                props.onChangeNotifyDays(
                  Math.min(NOTIFY_MAX, props.notify_days_before + 1),
                )
              }
              disabled={props.notify_days_before >= NOTIFY_MAX || props.loading}
              aria-label="Увеличить дни уведомления"
            >
              +
            </button>
          </div>
        </div>

        {/* Row 3: AI authorization toggle */}
        <div className={styles.row}>
          <Eyebrow color="var(--poster-ink, #0E0E0E)">
            AI авто-категоризация
          </Eyebrow>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={props.ai_categorization_enabled}
              onChange={(e) => props.onToggleAiCat(e.target.checked)}
              disabled={props.loading}
              data-testid="ai-cat-toggle"
              aria-label="AI авто-категоризация"
            />
            <span className={styles.readonlyValue}>
              {props.ai_categorization_enabled ? 'ВКЛ' : 'ВЫКЛ'}
            </span>
          </label>
        </div>

        {/* Row 4: AI spend cap (read-only) */}
        <div className={styles.row}>
          <Eyebrow color="var(--poster-ink, #0E0E0E)">
            AI лимит расходов
          </Eyebrow>
          <div className={styles.readonlyValue} data-testid="ai-cap-value">
            {capRubles.toLocaleString('ru-RU')} ₽
          </div>
        </div>

        {/* Row 5: Phase 30-07 (DEBT-08) — Home background color picker. */}
        <button
          type="button"
          className={`${styles.row} ${styles.rowButton}`}
          onClick={() => props.onTogglePicker(true)}
          data-testid="home-color-row"
        >
          <Eyebrow color="var(--poster-ink, #0E0E0E)">Цвет Home</Eyebrow>
          <div className={styles.homeColorPreview}>
            <span
              className={styles.homeColorSwatch}
              style={{ background: homeColorCssValue(props.homeColor) }}
              aria-hidden
            />
            <span className={styles.homeColorLabel}>
              {homeColorLabel(props.homeColor)}
            </span>
            <span className={styles.chevron} aria-hidden>
              →
            </span>
          </div>
        </button>

        {/* Row 6: Phase 54-01 (LG-SW-02) — Theme picker. */}
        <button
          type="button"
          className={`${styles.row} ${styles.rowButton}`}
          onClick={() => props.onToggleThemePicker(true)}
          data-testid="theme-row"
        >
          <Eyebrow color="var(--poster-ink, #0E0E0E)">Тема</Eyebrow>
          <div className={styles.homeColorPreview}>
            <span className={styles.homeColorLabel}>
              {themeLabel(props.theme)}
            </span>
            <span className={styles.chevron} aria-hidden>
              →
            </span>
          </div>
        </button>
      </div>

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
