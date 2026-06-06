// Liquid Glass v2 — native iOS Savings («Копилка») view.
//
// Pushed DETAIL screen (no savings tab in the native shell — surfaced under the
// Management hub, see NativeMgmtHubView). Faithful native iOS rendering of the
// SAME data + handlers the poster SavingsView consumes:
//   - NativeNavBar «Копилка» + back chevron
//   - total-saved hero card («НАКОПЛЕНО ВСЕГО» + «В <месяце> +X ₽» inflow)
//   - «ОКРУГЛЕНИЕ ТРАТ» inset section: native toggle (roundup_enabled) +
//     base segmented control (10 / 50 / 100 ₽) — SAME onToggleRoundup /
//     onSelectBase handlers
//   - «ЦЕЛИ» inset-grouped goal rows with a native CSS progress bar (same
//     computeProgressPct values), tapping a goal → onContributeToGoal(id)
//   - empty state «Нет целей — добавьте первую»
//   - CTAs «+ Новая цель» (primary) / «Пополнить» (ghost) — SAME onAddGoal /
//     onDeposit handlers
//
// Pure presentational: consumes the SAME SavingsViewProps the poster receives;
// SavingsMount wires snapshot + handlers + sheets identically. No data logic is
// duplicated. Money via formatMoneyNative (kopecks shown when present).

import { memo } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
  Segmented,
} from '../native/NativePrimitives';
import { formatMoneyNative } from '../native/money';
import { computeProgressPct, formatDueRu } from './computeSavings';
import type { SavingsViewProps } from './SavingsView';
import styles from './NativeSavingsView.module.css';

// Russian prepositional month names for the «В <месяце>» inflow label.
const MONTHS_RU_PREP = [
  'январе',
  'феврале',
  'марте',
  'апреле',
  'мае',
  'июне',
  'июле',
  'августе',
  'сентябре',
  'октябре',
  'ноябре',
  'декабре',
];

type BaseValue = '10' | '50' | '100';

const BASE_OPTIONS: ReadonlyArray<{ value: BaseValue; label: string }> = [
  { value: '10', label: '10 ₽' },
  { value: '50', label: '50 ₽' },
  { value: '100', label: '100 ₽' },
];

function NativeSavingsViewInner(props: SavingsViewProps) {
  const {
    snapshot,
    loading,
    error,
    onToggleRoundup,
    onSelectBase,
    onAddGoal,
    onDeposit,
    onContributeToGoal,
    onBack,
  } = props;

  // ─── Loading sub-view ───
  if (loading && snapshot === null) {
    return (
      <div className={styles.root} data-testid="native-savings-loading">
        <NativeNavBar title="Копилка" onBack={onBack} />
        <div className={styles.statusMsg}>Загрузка…</div>
      </div>
    );
  }

  // ─── Error sub-view ───
  if (error && snapshot === null) {
    return (
      <div className={styles.root} data-testid="native-savings-error">
        <NativeNavBar title="Копилка" onBack={onBack} />
        <div className={styles.statusMsg}>Ошибка</div>
        <div className={styles.errorMsg}>{error}</div>
      </div>
    );
  }

  // ─── Ready sub-view ───
  // snapshot may stay non-null during a refetch — render last good data.
  const snap = snapshot;
  if (!snap) return null;

  const monthLabel = MONTHS_RU_PREP[new Date().getMonth()];

  return (
    <div className={styles.root} data-testid="native-savings-view">
      <NativeNavBar title="Копилка" onBack={onBack} />

      {/* ───── total-saved hero ───── */}
      <div className={styles.hero}>
        <span className={styles.heroLabel}>Накоплено всего</span>
        <span className={styles.heroAmount}>
          {formatMoneyNative(snap.total_cents)}
          <span className={styles.heroCur}>₽</span>
        </span>
        <span className={styles.heroSub}>
          {`В ${monthLabel} `}
          <span className={styles.heroSubPositive}>
            {`+${formatMoneyNative(snap.month_in_cents)} ₽`}
          </span>
        </span>
      </div>

      {/* ───── roundup section ───── */}
      <SectionHeader>Округление трат</SectionHeader>
      <InsetGroup>
        <InsetRow
          testId="native-savings-roundup-toggle"
          leading={
            <span className={styles.iconTile} aria-hidden="true">
              <ArrowsClockwise size={18} weight="fill" color="#fff" />
            </span>
          }
          title={`Округлять до ${snap.config.roundup_base} ₽`}
          subtitle={snap.config.roundup_enabled ? 'Включено' : 'Выключено'}
          trailing={
            <button
              type="button"
              role="switch"
              aria-checked={snap.config.roundup_enabled}
              aria-label="Округление трат"
              className={`${styles.switch} ${
                snap.config.roundup_enabled ? styles.switchOn : ''
              }`}
              onClick={() => onToggleRoundup(!snap.config.roundup_enabled)}
              data-testid="native-roundup-switch"
            >
              <span className={styles.switchKnob} />
            </button>
          }
        />
      </InsetGroup>
      <div className={styles.baseRow}>
        <Segmented<BaseValue>
          ariaLabel="База округления"
          options={BASE_OPTIONS}
          value={String(snap.config.roundup_base) as BaseValue}
          onChange={(v) => onSelectBase(Number(v) as 10 | 50 | 100)}
        />
      </div>

      {/* ───── goals section ───── */}
      <SectionHeader>Цели</SectionHeader>
      {snap.goals.length === 0 ? (
        <div className={styles.empty} data-testid="native-savings-empty">
          Нет целей — добавьте первую
        </div>
      ) : (
        <InsetGroup>
          {snap.goals.map((g) => {
            const pct = computeProgressPct(g.current_cents, g.target_cents);
            const dueRu = formatDueRu(g.due);
            return (
              <InsetRow
                key={g.id}
                testId={`native-goal-row-${g.id}`}
                chevron
                onClick={() => onContributeToGoal(g.id)}
                title={
                  <span className={styles.goalMain}>
                    <span className={styles.goalTopRow}>
                      <span className={styles.goalName}>{g.name}</span>
                      <span className={styles.goalPct}>{pct}%</span>
                    </span>
                    {dueRu !== null && (
                      <span className={styles.goalDue}>срок · {dueRu}</span>
                    )}
                    <span className={styles.goalNumbers}>
                      {`${formatMoneyNative(g.current_cents)} / ${formatMoneyNative(
                        g.target_cents,
                      )} ₽`}
                    </span>
                    <span className={styles.goalTrack}>
                      <span
                        className={styles.goalFill}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </span>
                }
              />
            );
          })}
        </InsetGroup>
      )}

      {/* ───── CTAs ───── */}
      <div className={styles.ctas}>
        <button
          type="button"
          className={`${styles.cta} ${styles.ctaPrimary}`}
          onClick={onAddGoal}
          data-testid="native-savings-add-goal"
        >
          + Новая цель
        </button>
        <button
          type="button"
          className={`${styles.cta} ${styles.ctaGhost}`}
          onClick={onDeposit}
          data-testid="native-savings-deposit"
        >
          Пополнить
        </button>
      </div>
    </div>
  );
}

export const NativeSavingsView = memo(NativeSavingsViewInner);
