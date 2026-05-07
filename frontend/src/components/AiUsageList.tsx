import type { AdminAiUsageRow } from '../api/types';
import styles from './AiUsageList.module.css';

export interface AiUsageListProps {
  users: AdminAiUsageRow[];
}

/** Backend stores cost as integer cents-of-USD: 10000 cents = 1 USD. */
function formatUsd(centsOfUsd: number): string {
  const usd = centsOfUsd / 10_000;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * Phase 13 AIUSE-01..03 — per-user AI cost breakdown с linear progress bar.
 *
 * Visual pattern reused from DashboardCategoryRow:
 *   pct_of_cap ≥ 0.8 → warn-style (амбер)
 *   pct_of_cap ≥ 1.0 → danger-style (red) + percent badge
 * Sort обеспечивается backend (est_cost_cents_current_month desc, см. Plan
 * 13-05). Empty rows fallback к alphabet handled backend-side.
 */
export function AiUsageList({ users }: AiUsageListProps) {
  if (users.length === 0) {
    return (
      <p className={styles.empty}>Нет данных по AI-использованию.</p>
    );
  }
  return (
    <ul className={styles.list}>
      {users.map((u) => {
        const pct = u.pct_of_cap;
        const isWarn = pct >= 0.8 && pct < 1.0;
        const isDanger = pct >= 1.0;
        const fillWidth = `${Math.min(Math.max(pct, 0) * 100, 100)}%`;
        const rowCls = [
          styles.row,
          isWarn ? styles.warn : '',
          isDanger ? styles.danger : '',
        ].filter(Boolean).join(' ');
        const barFillCls = [
          styles.barFill,
          isWarn ? styles.barWarn : '',
          isDanger ? styles.barDanger : '',
        ].filter(Boolean).join(' ');

        // Convert last_30d est_cost_usd (float USD) → cents-of-USD for unified format.
        const last30Cents = Math.round(u.last_30d.est_cost_usd * 10_000);

        return (
          <li key={u.user_id} className={rowCls}>
            <div className={styles.topRow}>
              <span className={styles.name}>
                {u.name ?? String(u.tg_user_id)}
                {u.role === 'owner' && (
                  <span className={styles.ownerTag}> · вы</span>
                )}
              </span>
              <span className={styles.amount}>
                <span className={styles.actual}>
                  {formatUsd(u.est_cost_cents_current_month)}
                </span>
                <span className={styles.cap}>
                  {' / '}
                  {formatUsd(u.spending_cap_cents)}
                </span>
                {isDanger && (
                  <span className={styles.badge}>{Math.round(pct * 100)}%</span>
                )}
              </span>
            </div>
            <div className={styles.bar} aria-hidden="true">
              <div className={barFillCls} style={{ width: fillWidth }} />
            </div>
            <div className={styles.subRow}>
              <span>
                тек. месяц: {formatTokens(u.current_month.total_tokens)} токенов
              </span>
              <span className={styles.dot}>·</span>
              <span>30д: {formatUsd(last30Cents)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
