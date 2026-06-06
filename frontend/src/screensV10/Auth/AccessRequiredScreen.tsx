// AccessRequiredScreen — the ONLY thing rendered for an unauthenticated /
// unauthorized user. Pure static dead-end: no TabBar, no FAB, no AddSheet,
// no data calls. The single action is an optional deep-link to the bot to
// request access. Security: by rendering this INSTEAD of the shell (not
// alongside a disabled shell), there is zero interactive app surface to poke.

import { openTelegramLink } from '../../api/client';
import styles from './AccessRequiredScreen.module.css';

const BOT_USERNAME = 'tg_budget_planner_bot';

export interface AccessRequiredScreenProps {
  /** 'unauthenticated' (no/invalid initData) vs 'forbidden' (not whitelisted). */
  kind: 'unauthenticated' | 'forbidden';
}

export function AccessRequiredScreen({ kind }: AccessRequiredScreenProps) {
  // 'unauthenticated' (no/invalid initData): the request-access CTA cannot work
  // without a Telegram session, so lead with «open from Telegram» and hide it.
  // 'forbidden' (valid session, not whitelisted): keep the CTA and expose the
  // bot @handle as selectable text so the user can reach out manually too.
  const isUnauthenticated = kind === 'unauthenticated';

  const message = isUnauthenticated
    ? 'Откройте приложение из Telegram — здесь нет доступа без подтверждённой сессии.'
    : 'У вас нет доступа к этому бюджету. Запросите доступ у владельца.';

  const requestAccess = () => {
    openTelegramLink(`https://t.me/${BOT_USERNAME}?start=request_access`);
  };

  return (
    <div className={styles.root} data-testid="access-required">
      <div className={styles.eyebrow}>Доступ</div>
      <div className={styles.lock} aria-hidden="true">
        ⦸
      </div>
      <h1 className={styles.title}>Доступ закрыт.</h1>
      <p className={styles.message}>{message}</p>
      {!isUnauthenticated && (
        <>
          <button type="button" className={styles.cta} onClick={requestAccess}>
            Запросить доступ
          </button>
          <p className={styles.botHandle}>
            Или напишите боту:{' '}
            <span className={styles.botHandleValue}>@{BOT_USERNAME}</span>
          </p>
        </>
      )}
    </div>
  );
}
