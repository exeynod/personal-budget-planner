// Phase 27-06 Task 2: AccessView (black) — admin Users + AI Usage tabs in poster style.
//
// Pure presentational. Re-styles the v0.6 AccessScreen content (admin v0.6
// endpoints reused via AccessMount) into a poster-style two-tab list.

import { Eyebrow, Mass } from '../../componentsV10';
import styles from './AccessView.module.css';

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

export interface AccessViewProps {
  users: AccessUser[];
  aiUsage: AccessAiUsage[];
  activeTab: AccessTab;
  onSwitchTab: (t: AccessTab) => void;
  loading: boolean;
  error: string | null;
  canPop: boolean;
  onBack: () => void;
}

export function AccessView(props: AccessViewProps) {
  return (
    <div className={styles.root} data-testid="access-view">
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
        <Eyebrow color="var(--poster-paper, #FFF6E8)">ACCESS / ДОСТУП</Eyebrow>
      </div>

      <Mass italic size={56} className={styles.headlineMass}>
        Доступ.
      </Mass>

      <div className={styles.tabBar} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={props.activeTab === 'users'}
          className={`${styles.tabChip}${
            props.activeTab === 'users' ? ' ' + styles.tabChipActive : ''
          }`}
          onClick={() => props.onSwitchTab('users')}
        >
          Пользователи
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.activeTab === 'ai-usage'}
          className={`${styles.tabChip}${
            props.activeTab === 'ai-usage' ? ' ' + styles.tabChipActive : ''
          }`}
          onClick={() => props.onSwitchTab('ai-usage')}
        >
          AI Usage
        </button>
      </div>

      {props.loading && (
        <div className={styles.loadingBanner} data-testid="access-loading">
          Загрузка…
        </div>
      )}
      {props.error && (
        <div className={styles.errorBanner} data-testid="access-error">
          {props.error}
        </div>
      )}

      {!props.loading && !props.error && props.activeTab === 'users' && (
        <div className={styles.tabContent} data-testid="users-tab">
          {props.users.length === 0 ? (
            <div className={styles.empty}>Нет пользователей</div>
          ) : (
            props.users.map((u) => (
              <div key={u.id} className={styles.row}>
                <div>
                  <div className={styles.userName}>
                    {u.username ?? `ID ${u.tg_user_id}`}
                  </div>
                  <div className={styles.userMeta}>
                    tg_id: {u.tg_user_id}
                  </div>
                </div>
                <div className={styles.userRole}>{u.role}</div>
              </div>
            ))
          )}
        </div>
      )}

      {!props.loading && !props.error && props.activeTab === 'ai-usage' && (
        <div className={styles.tabContent} data-testid="ai-usage-tab">
          {props.aiUsage.length === 0 ? (
            <div className={styles.empty}>Нет данных</div>
          ) : (
            props.aiUsage.map((row) => {
              const costRubles = (row.cost_cents / 100).toFixed(2);
              return (
                <div key={row.user_id} className={styles.row}>
                  <div className={styles.usageCells}>
                    <span className={styles.usageDate}>
                      {row.name ?? `ID ${row.user_id}`}
                    </span>
                    <span className={styles.usageTokens}>
                      {row.tokens.toLocaleString('ru-RU')} tok
                    </span>
                    <span className={styles.usageCost}>${costRubles}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
