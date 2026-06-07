// Liquid Glass v2 — native iOS Access view (owner-only whitelist + AI usage).
//
// Faithful port of the poster AccessView (Management «Доступ»):
//   - pushed detail → NativeNavBar «Доступ» + back chevron
//   - Segmented control «Пользователи | AI Usage» driving the SAME
//     activeTab / onSwitchTab the poster two-tab chip-bar uses
//   - «Пользователи» tab: inset-grouped white card of whitelist members —
//     avatar tile + name (or «ID …») + tg_id subtitle + role badge
//   - «AI Usage» tab: inset-grouped card of per-user usage — name/id +
//     tokens subtitle + estimated cost trailing
//
// Pure presentational: consumes the SAME props the poster AccessView receives
// (AccessMount wires data + handlers identically). The poster screen is
// READ-ONLY — it has no add/remove member control and no AI cap — so per the
// brief «NO invented functionality» this view adds none either. Money is shown
// with the poster's exact «$X.XX» dollar-estimate semantics (the cost field is
// a USD estimate, not rubles), only the grouping uses the native formatter.

import { memo } from 'react';
import {
  NativeNavBar,
  Segmented,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { formatMoneyNative } from '../native/money';
import styles from './NativeAccessView.module.css';

export interface AccessUser {
  id: number;
  tg_user_id: number;
  username: string | null;
  role: string;
}

export interface AccessAiUsage {
  user_id: number;
  name: string | null;
  tokens: number;
  cost_cents: number;
}

export type AccessTab = 'users' | 'ai-usage';

// Props the view consumes (AccessMount passes the same object).
export interface NativeAccessViewProps {
  users: AccessUser[];
  aiUsage: AccessAiUsage[];
  activeTab: AccessTab;
  onSwitchTab: (t: AccessTab) => void;
  loading: boolean;
  error: string | null;
  canPop: boolean;
  onBack: () => void;
}

const TAB_OPTIONS: ReadonlyArray<{ value: AccessTab; label: string }> = [
  { value: 'users', label: 'Пользователи' },
  { value: 'ai-usage', label: 'AI Usage' },
];

/**
 * USD cost estimate. The poster renders «$X.XX» via `(cost_cents/100).toFixed(2)`
 * — a fixed 2-decimal dollar figure. We keep those exact semantics (always two
 * decimals, a dot separator, the «$» prefix) and only borrow the native
 * thousands-grouping (U+202F narrow space) from `formatMoneyNative` for the
 * dollar part, so large estimates read «$1 234.56» in the iOS list style.
 */
function formatUsdEstimate(costCents: number): string {
  const abs = Math.abs(Math.trunc(costCents));
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  // formatMoneyNative(dollars * 100) → grouped whole-dollar string (no kopecks).
  const grouped = formatMoneyNative(dollars * 100);
  const body = `$${grouped}.${cents.toString().padStart(2, '0')}`;
  return costCents < 0 ? `−${body}` : body;
}

function NativeAccessViewInner(props: NativeAccessViewProps) {
  const { users, aiUsage, activeTab, onSwitchTab, loading, error, onBack } =
    props;

  return (
    <div className={styles.root} data-testid="native-access-view">
      <NativeNavBar title="Доступ" onBack={onBack} />

      <div className={styles.segmentedRow}>
        <Segmented
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={onSwitchTab}
          ariaLabel="Раздел доступа"
        />
      </div>

      {loading && (
        <div className={styles.banner} data-testid="native-access-loading">
          Загрузка…
        </div>
      )}
      {error && (
        <div
          className={`${styles.banner} ${styles.bannerError}`}
          data-testid="native-access-error"
        >
          {error}
        </div>
      )}

      {!loading && !error && activeTab === 'users' && (
        <div data-testid="native-access-users">
          {users.length === 0 ? (
            <div className={styles.empty}>Нет пользователей</div>
          ) : (
            <InsetGroup>
              {users.map((u) => {
                const name = u.username ?? `ID ${u.tg_user_id}`;
                const letter = name.charAt(0).toUpperCase();
                return (
                  <InsetRow
                    key={u.id}
                    testId={`native-access-user-${u.id}`}
                    leading={
                      <span className={styles.avatar} aria-hidden="true">
                        {letter}
                      </span>
                    }
                    title={name}
                    subtitle={`tg_id: ${u.tg_user_id}`}
                    trailing={
                      <span className={styles.roleBadge}>{u.role}</span>
                    }
                  />
                );
              })}
            </InsetGroup>
          )}
        </div>
      )}

      {!loading && !error && activeTab === 'ai-usage' && (
        <div data-testid="native-access-ai-usage">
          {aiUsage.length === 0 ? (
            <div className={styles.empty}>Нет данных</div>
          ) : (
            <InsetGroup>
              {aiUsage.map((row) => {
                const name = row.name ?? `ID ${row.user_id}`;
                return (
                  <InsetRow
                    key={row.user_id}
                    testId={`native-access-usage-${row.user_id}`}
                    title={name}
                    subtitle={`${row.tokens.toLocaleString('ru-RU')} tok`}
                    trailing={
                      <span className={styles.cost}>
                        {formatUsdEstimate(row.cost_cents)}
                      </span>
                    }
                  />
                );
              })}
            </InsetGroup>
          )}
        </div>
      )}
    </div>
  );
}

export const NativeAccessView = memo(NativeAccessViewInner);
