// Liquid Glass v2 — native iOS Subscriptions view (pushed detail).
//
// Faithful native port of the poster SubscriptionsView. Subscriptions is a
// PUSHED detail screen reached from the Management hub, so it renders a
// <NativeNavBar title="Подписки" onBack={…} /> (back chevron, centered title)
// rather than a large title.
//
// Pure presentational: SubscriptionsMount wires the data (SAME props the poster
// SubscriptionsView receives) + the row menu / back handlers. No data logic is
// duplicated — counts / monthly+yearly totals come from the same compute
// helpers; rows are sorted by sortForDisplay().
//
// Control fidelity (brief §Conventions «NO invented functionality»): the poster
// screen has NO add affordance — subscriptions are created elsewhere — so there
// is NO trailing «+» here. Per-row edit/delete is reached via the «···» menu
// button which drives the SAME onMenuOpen(sub) → SubscriptionMenuSheet (owned by
// the Mount, design-agnostic) as the poster.

import { memo } from 'react';
import { DotsThreeOutline } from '@phosphor-icons/react';
import {
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { formatMoneyRubNative } from '../native/money';
import type { SubscriptionV10Read, AccountResponse } from '../../api/v10';
import {
  computeActiveCount,
  computeMonthlyTotal,
  computeYearlyTotalAnnualized,
  formatAccountLabel,
  formatCadenceRu,
  sortForDisplay,
} from './computeSubscriptions';
import styles from './NativeSubscriptionsView.module.css';

// ─────────────────── Props (mirror poster SubscriptionsView) ───────────────────

export interface NativeSubscriptionsViewProps {
  /** Subscriptions list (any order — view sorts internally). */
  subs: SubscriptionV10Read[];
  /** Accounts for resolving each sub's `account_id` → «BANK · MASK» label. */
  accounts?: AccountResponse[];
  /** «···» tap → opens the bottom-sheet menu (edit day/price/account, pause, delete). */
  onMenuOpen: (sub: SubscriptionV10Read) => void;
  /** Back chevron handler (router.pop). */
  onBack: () => void;
}

function NativeSubscriptionsViewInner(props: NativeSubscriptionsViewProps) {
  const { subs, accounts, onMenuOpen, onBack } = props;

  // Pushed detail (reached from the Management hub) → NativeNavBar with a back
  // chevron + centered title (NavLevel default isRoot=false). onBack is the
  // router.pop wired by the Mount.
  const sorted = sortForDisplay(subs);
  const activeCount = computeActiveCount(subs);
  const monthlyCents = computeMonthlyTotal(subs);
  const yearlyCents = computeYearlyTotalAnnualized(subs);

  return (
    <div className={styles.root}>
      <NativeNavBar title="Подписки" onBack={onBack} />

      {/* Summary — Σ/мес + «N активных · Y ₽ в год» wrapped in the first inset
       * card (P1-5) instead of a bare bold figure (same data as the poster
       * BigFig + eyebrow). */}
      <InsetGroup>
        <div className={styles.summaryCard} data-testid="native-subs-summary">
          <span className={styles.summaryAmount}>
            {formatMoneyRubNative(monthlyCents)}
            <span className={styles.summaryPer}>/мес</span>
          </span>
          <span className={styles.summaryMeta}>
            {`${activeCount} активных · ${formatMoneyRubNative(yearlyCents)} в год`}
          </span>
        </div>
      </InsetGroup>

      <SectionHeader>Подписки</SectionHeader>

      {sorted.length === 0 ? (
        <div className={styles.empty} data-testid="native-subs-empty">
          Нет подписок
        </div>
      ) : (
        <InsetGroup>
          {sorted.map((s) => {
            const accountLabel = formatAccountLabel(s, accounts ?? []);
            const cadence = formatCadenceRu(s);
            // Sub-line: cadence, plus account label when linked. Paused subs
            // are flagged so the trailing amount reads muted.
            const subtitleParts = [cadence];
            if (accountLabel != null) subtitleParts.push(accountLabel);
            if (!s.is_active) subtitleParts.push('на паузе');
            const subtitle = subtitleParts.join(' · ');

            return (
              <InsetRow
                key={s.id}
                testId={`native-subs-row-${s.id}`}
                leading={<CategoryIcon name={s.name} id={s.id} />}
                title={
                  <span
                    className={`${styles.subName} ${
                      !s.is_active ? styles.subNameInactive : ''
                    }`}
                  >
                    {s.name}
                  </span>
                }
                subtitle={subtitle}
                trailing={
                  <span className={styles.rowTrailing}>
                    <span
                      className={`${styles.subPrice} ${
                        !s.is_active ? styles.subPriceInactive : ''
                      }`}
                    >
                      {formatMoneyRubNative(s.amount_cents)}
                    </span>
                    <button
                      type="button"
                      className={styles.menuBtn}
                      // Stop the row's own onClick (none here) and open the menu.
                      onClick={(e) => {
                        e.stopPropagation();
                        onMenuOpen(s);
                      }}
                      aria-label={`Меню для ${s.name}`}
                      data-testid={`native-subs-menu-btn-${s.id}`}
                    >
                      <DotsThreeOutline size={20} weight="fill" />
                    </button>
                  </span>
                }
                // Row tap → open the same edit/delete menu (mirrors brief
                // «row tap → edit»; poster exposed it only via the «···» btn).
                onClick={() => onMenuOpen(s)}
              />
            );
          })}
        </InsetGroup>
      )}
    </div>
  );
}

export const NativeSubscriptionsView = memo(NativeSubscriptionsViewInner);
