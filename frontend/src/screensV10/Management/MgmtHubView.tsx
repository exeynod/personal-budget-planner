// Phase 27-06 Task 1 GREEN: MgmtHubView (black) — numbered list hub.
//
// Pure presentational. 5 rows for owner / 4 rows for member (no «ДОСТУП»).
// Renders Eyebrow «MANAGEMENT / УПРАВЛЕНИЕ» + Mass italic «Управление.» +
// `<ol>` of numbered <button> rows. View is router-agnostic — all interactions
// passed as props (mirrors HomeView / TransactionsView / SubscriptionsView pattern).
//
// Threat T-27-06-01 (non-owner sees ДОСТУП row): mitigated by hiding the
// row when isOwner=false. AccessMount also re-checks (defence-in-depth) and
// backend admin routes already require `owner` role.

import { Eyebrow, Mass } from '../../componentsV10';
import styles from './MgmtHubView.module.css';

export type MgmtRowId = 'plan' | 'accounts' | 'analytics' | 'settings' | 'access';

export interface MgmtHubViewProps {
  /** True → render «05 ДОСТУП» row (owner-only). */
  isOwner: boolean;
  /** Row tap callback — pushes corresponding Mount in MgmtHubMount. */
  onRowTap: (id: MgmtRowId) => void;
  /** Whether the back link should be visible. */
  canPop: boolean;
  /** Back link tap. */
  onBack: () => void;
}

interface RowDef {
  id: MgmtRowId;
  n: string;
  name: string;
  ownerOnly?: boolean;
}

const ROWS: RowDef[] = [
  { id: 'plan', n: '01', name: 'PLAN МЕСЯЦА' },
  { id: 'accounts', n: '02', name: 'СЧЕТА' },
  { id: 'analytics', n: '03', name: 'АНАЛИТИКА' },
  { id: 'settings', n: '04', name: 'НАСТРОЙКИ' },
  { id: 'access', n: '05', name: 'ДОСТУП', ownerOnly: true },
];

export function MgmtHubView(props: MgmtHubViewProps) {
  const visible = ROWS.filter((r) => !r.ownerOnly || props.isOwner);

  return (
    <div className={styles.root} data-testid="mgmt-hub-view">
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
        <Eyebrow color="var(--poster-paper, #FFF6E8)">
          MANAGEMENT / УПРАВЛЕНИЕ
        </Eyebrow>
      </div>

      <Mass italic size={70} className={styles.headlineMass}>
        Управление.
      </Mass>

      <ol className={styles.numberedList}>
        {visible.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className={styles.row}
              onClick={() => props.onRowTap(row.id)}
              data-testid={`mgmt-row-${row.id}`}
            >
              <span className={styles.rowNum}>{row.n}</span>
              <span className={styles.rowName}>{row.name}</span>
              <span className={styles.rowArrow}>→</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
