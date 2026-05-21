// Phase 26-06 Task 2: SubscriptionsView (coral) — pure presentational component
// covering SUBS-V10-01..02.
//
// Renders mirror of prototype/poster-screens.jsx PosterSubscriptions:
//   - Coral absolute-fill background; ← НАЗАД top-left link (mono).
//   - Eyebrow «SUBSCRIPTIONS».
//   - Mass italic «Подписки.» size 70, ink colour.
//   - BigFig Math.floor(monthly_total/100), suffix «₽/мес».
//   - Eyebrow «N АКТИВНЫХ · Y ₽ В ГОД» (Y = monthly*12 + yearly_sum).
//   - List rows: name UPPER · cadence (small mono) · price · ··· menu button.
//   - Empty state: italic «Нет подписок».
//
// View is router-agnostic (no usePosterRouter import) — all interactions
// are passed as callbacks. Mirrors HomeView / TransactionsView / CategoryDetailView
// pattern from Phase 25-04 / 25-08 / 26-02.

import { Eyebrow, Mass, BigFig } from '../../componentsV10';
import type { SubscriptionV10Read, AccountResponse } from '../../api/v10';
import {
  computeActiveCount,
  computeMonthlyTotal,
  computeYearlyTotalAnnualized,
  formatAccountLabel,
  formatCadenceRu,
  sortForDisplay,
} from './computeSubscriptions';
import styles from './SubscriptionsView.module.css';

export interface SubscriptionsViewProps {
  /** Subscriptions list (any order — view sorts internally). */
  subs: SubscriptionV10Read[];
  /**
   * P3-W1: accounts for resolving each subscription's `account_id` to a
   * display label («BANK · MASK»). Defaults to [] when not yet loaded.
   */
  accounts?: AccountResponse[];
  /** ··· tap → opens bottom-sheet menu for the row. */
  onMenuOpen: (sub: SubscriptionV10Read) => void;
  /** Top-left ← НАЗАД button. */
  onBack: () => void;
  /**
   * Disable BigFig count-up animation in tests (so toContain('799') works
   * synchronously). Default true to match prototype motion.
   */
  bigFigAnimate?: boolean;
}

export function SubscriptionsView(props: SubscriptionsViewProps) {
  const sorted = sortForDisplay(props.subs);
  const activeCount = computeActiveCount(props.subs);
  const monthlyCents = computeMonthlyTotal(props.subs);
  const yearlyCents = computeYearlyTotalAnnualized(props.subs);
  const monthlyRubles = Math.floor(monthlyCents / 100);
  const yearlyRubles = Math.floor(yearlyCents / 100);

  return (
    <div className={styles.root}>
      {/* ─────────── back link ─────────── */}
      <div className={styles.headerRow}>
        <button
          type="button"
          className={styles.backLink}
          onClick={props.onBack}
        >
          ← НАЗАД
        </button>
      </div>

      {/* ─────────── eyebrow ─────────── */}
      <div className={styles.eyebrowRow}>
        <Eyebrow color="var(--poster-paper)">SUBSCRIPTIONS</Eyebrow>
      </div>

      {/* ─────────── headline ─────────── */}
      <Mass italic size={70} className={styles.headlineMass}>
        Подписки.
      </Mass>

      {/* ─────────── BigFig monthly_total ₽/мес ─────────── */}
      {/* Phase 29-04 §6 Subscriptions BLOCKER #2 — size 86 → 56 per
       * prototype/poster-screens.jsx:1097 (was +30px out of ±4px). */}
      <BigFig
        value={monthlyRubles}
        sup="₽/мес"
        size={56}
        color="var(--poster-paper)"
        animate={props.bigFigAnimate ?? true}
        className={styles.bigFig}
      />

      {/* ─────────── eyebrow N АКТИВНЫХ · Y ₽ В ГОД ─────────── */}
      <div className={styles.statsRow}>
        <Eyebrow color="var(--poster-paper)">
          {`${activeCount} АКТИВНЫХ · ${yearlyRubles.toLocaleString('ru-RU')} ₽ В ГОД`}
        </Eyebrow>
      </div>

      {/* ─────────── list ─────────── */}
      {sorted.length === 0 ? (
        <div className={styles.emptyState}>Нет подписок</div>
      ) : (
        <div className={styles.list}>
          {sorted.map((s) => {
            const priceRubles = Math.floor(s.amount_cents / 100);
            const accountLabel = formatAccountLabel(s, props.accounts ?? []);
            return (
              <div
                key={s.id}
                className={`${styles.row} ${!s.is_active ? styles.inactive : ''}`}
              >
                <div className={styles.rowLeft}>
                  <div className={styles.subName}>{s.name.toUpperCase()}</div>
                  <div className={styles.subCadence}>{formatCadenceRu(s)}</div>
                  {accountLabel != null && (
                    <div
                      className={styles.subAccount}
                      data-testid={`sub-account-${s.id}`}
                    >
                      {accountLabel}
                    </div>
                  )}
                </div>
                <div className={styles.rowRight}>
                  <div className={styles.subPrice}>
                    {`${priceRubles.toLocaleString('ru-RU')} ₽`}
                  </div>
                  <button
                    type="button"
                    className={styles.menuBtn}
                    onClick={() => props.onMenuOpen(s)}
                    aria-label={`Меню для ${s.name}`}
                    data-testid={`sub-menu-btn-${s.id}`}
                  >
                    ···
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
