// Phase 27-03 (SAV-V10-01..04): SavingsView — pure presentational component.
//
// Surface (poster black):
//   - Optional ← НАЗАД button (when canPop) + Eyebrow «SAVINGS / КОПИЛКА»
//   - Mass italic «Копилка.» 70px, paper colour
//   - Yellow Plate «НАКОПЛЕНО ВСЕГО · X ₽» (BigFig with ₽ suffix)
//   - Eyebrow «В МАЕ + Y ₽» (current MSK month inflows)
//   - Section «ОКРУГЛЕНИЕ ТРАТ» — toggle ВКЛ/ВЫКЛ + 3 base chips (10/50/100 ₽)
//   - Section «ЦЕЛИ» — N goal cards (name UPPER · «срок · {due}» ·
//     «{cur}/{target} ₽» · «{pct}%» · posterBarFill progress bar)
//   - Empty state «Нет целей — добавьте первую»
//   - CTAs row: «+ НОВАЯ ЦЕЛЬ» (primary) + «ПОПОЛНИТЬ» (ghost)
//
// Loading / error are sub-views (parent handles retry — view is
// router-agnostic). Mirrors PlanView / SubscriptionsView pattern from
// Phase 26-04 / 26-06.

import { Eyebrow, Mass, BigFig, Plate, Chip, PosterButton } from '../../componentsV10';
import type { SavingsSnapshot } from '../../api/v10';
import { computeProgressPct, formatDueRu } from './computeSavings';
import styles from './SavingsView.module.css';

export interface SavingsViewProps {
  /** Full snapshot from GET /api/v1/savings; null while loading. */
  snapshot: SavingsSnapshot | null;
  /** True until snapshot first resolves. */
  loading: boolean;
  /** Server / network error string; null when fine. */
  error: string | null;
  /** Toggle button click — Mount sends PATCH /savings/config. */
  onToggleRoundup: (enabled: boolean) => void;
  /** Chip click — Mount sends PATCH /savings/config. */
  onSelectBase: (base: 10 | 50 | 100) => void;
  /** «+ НОВАЯ ЦЕЛЬ» click — Mount opens NewGoalSheet. */
  onAddGoal: () => void;
  /** «ПОПОЛНИТЬ» click — Mount opens DepositSheet (no goal preselected). */
  onDeposit: () => void;
  /** Goal card click — Mount opens DepositSheet preselected for goalId. */
  onContributeToGoal: (goalId: number) => void;
  /** True when router has previous screen (← НАЗАД visible). */
  canPop: boolean;
  /** Back button click. */
  onBack: () => void;
  /**
   * Disable BigFig count-up animation in tests so toContain('799')
   * works synchronously. Default true to match prototype motion.
   */
  bigFigAnimate?: boolean;
}

const BASE_CHIPS: Array<10 | 50 | 100> = [10, 50, 100];

export function SavingsView(props: SavingsViewProps) {
  const {
    snapshot,
    loading,
    error,
    onToggleRoundup,
    onSelectBase,
    onAddGoal,
    onDeposit,
    onContributeToGoal,
    canPop,
    onBack,
    bigFigAnimate,
  } = props;

  // ─── Loading sub-view ───
  if (loading && snapshot === null) {
    return (
      <div className={styles.root} data-testid="savings-loading">
        <div className={styles.headerRow}>
          {canPop && (
            <button
              type="button"
              className={styles.backBtn}
              onClick={onBack}
              aria-label="Назад"
            >
              ← НАЗАД
            </button>
          )}
          <Eyebrow color="var(--poster-paper)">SAVINGS / КОПИЛКА</Eyebrow>
        </div>
        <div className={styles.statusMsg}>ЗАГРУЗКА…</div>
      </div>
    );
  }

  // ─── Error sub-view ───
  if (error && snapshot === null) {
    return (
      <div className={styles.root} data-testid="savings-error">
        <div className={styles.headerRow}>
          {canPop && (
            <button
              type="button"
              className={styles.backBtn}
              onClick={onBack}
              aria-label="Назад"
            >
              ← НАЗАД
            </button>
          )}
          <Eyebrow color="var(--poster-paper)">SAVINGS / КОПИЛКА</Eyebrow>
        </div>
        <div className={styles.statusMsg}>ОШИБКА</div>
        <div className={styles.errorMsg}>{error}</div>
      </div>
    );
  }

  // ─── Ready sub-view ───
  // snapshot may be non-null even with `loading=true` during a refetch — render
  // the last good snapshot rather than blanking the screen.
  const snap = snapshot;
  if (!snap) return null;

  const totalRubles = Math.floor(snap.total_cents / 100);
  const monthInRubles = Math.floor(snap.month_in_cents / 100);
  // Russian genitive month name from current local date — UI label «В МАЕ + Y ₽».
  const MONTHS_RU = [
    'ЯНВАРЕ',
    'ФЕВРАЛЕ',
    'МАРТЕ',
    'АПРЕЛЕ',
    'МАЕ',
    'ИЮНЕ',
    'ИЮЛЕ',
    'АВГУСТЕ',
    'СЕНТЯБРЕ',
    'ОКТЯБРЕ',
    'НОЯБРЕ',
    'ДЕКАБРЕ',
  ];
  const monthLabel = MONTHS_RU[new Date().getMonth()];

  return (
    <div className={styles.root}>
      {/* ───── header ───── */}
      <div className={styles.headerRow}>
        {canPop && (
          <button
            type="button"
            className={styles.backBtn}
            onClick={onBack}
            aria-label="Назад"
          >
            ← НАЗАД
          </button>
        )}
        <Eyebrow color="var(--poster-paper)">SAVINGS / КОПИЛКА</Eyebrow>
      </div>

      {/* ───── headline ───── */}
      <Mass italic size={70} className={styles.headline}>
        Копилка.
      </Mass>

      {/* ───── total plate (yellow) ───── */}
      <Plate tone="yellow" className={styles.totalPlate}>
        <Eyebrow color="var(--poster-ink)">НАКОПЛЕНО ВСЕГО</Eyebrow>
        <BigFig
          value={totalRubles}
          sup="₽"
          size={86}
          color="var(--poster-ink)"
          animate={bigFigAnimate ?? true}
          className={styles.totalFig}
        />
      </Plate>

      {/* ───── month-in eyebrow ───── */}
      <div className={styles.monthRow}>
        <Eyebrow color="var(--poster-paper)">
          {`В ${monthLabel} + ${monthInRubles.toLocaleString('ru-RU')} ₽`}
        </Eyebrow>
      </div>

      {/* ───── roundup section ───── */}
      <div className={styles.sectionEyebrow}>
        <Eyebrow color="var(--poster-paper)">ОКРУГЛЕНИЕ ТРАТ</Eyebrow>
      </div>
      <div className={styles.toggleRow}>
        <button
          type="button"
          className={`${styles.toggleBtn} ${
            snap.config.roundup_enabled ? styles.toggleOn : styles.toggleOff
          }`}
          onClick={() => onToggleRoundup(!snap.config.roundup_enabled)}
          data-testid="roundup-toggle"
        >
          {snap.config.roundup_enabled ? 'ВКЛ' : 'ВЫКЛ'}
        </button>
        <div className={styles.chipsRow}>
          {BASE_CHIPS.map((b) => (
            <Chip
              key={b}
              active={snap.config.roundup_base === b}
              onClick={() => onSelectBase(b)}
              className={styles.baseChip}
            >
              {`${b} ₽`}
            </Chip>
          ))}
        </div>
      </div>

      {/* ───── goals section ───── */}
      <div className={styles.sectionEyebrow}>
        <Eyebrow color="var(--poster-paper)">ЦЕЛИ</Eyebrow>
      </div>
      {snap.goals.length === 0 ? (
        <div className={styles.emptyState}>Нет целей — добавьте первую</div>
      ) : (
        <div className={styles.goalsList}>
          {snap.goals.map((g) => {
            const pct = computeProgressPct(g.current_cents, g.target_cents);
            const dueRu = formatDueRu(g.due);
            const curR = Math.floor(g.current_cents / 100).toLocaleString('ru-RU');
            const tgtR = Math.floor(g.target_cents / 100).toLocaleString('ru-RU');
            return (
              <button
                key={g.id}
                type="button"
                className={styles.goalCard}
                onClick={() => onContributeToGoal(g.id)}
                data-testid={`goal-card-${g.id}`}
              >
                <div className={styles.goalName}>{g.name.toUpperCase()}</div>
                {dueRu !== null && (
                  <div className={styles.goalSub}>срок · {dueRu}</div>
                )}
                <div className={styles.goalNumbers}>
                  <span className={styles.goalAmount}>
                    {curR}/{tgtR} ₽
                  </span>
                  <span className={styles.goalPct}>{pct}%</span>
                </div>
                <div className={styles.goalProgressTrack}>
                  <div
                    className={styles.goalProgressFill}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ───── CTAs row ───── */}
      <div className={styles.ctasRow}>
        <PosterButton variant="primary" onClick={onAddGoal}>
          + НОВАЯ ЦЕЛЬ
        </PosterButton>
        <PosterButton variant="ghost" onClick={onDeposit}>
          ПОПОЛНИТЬ
        </PosterButton>
      </div>
    </div>
  );
}
