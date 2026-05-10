// Phase 26-06 Task 3: SubscriptionsMount — data fetcher + view glue.
//
// Lifecycle:
//   1. On mount, fetch subscriptions list.
//   2. Render <SubscriptionsView> wired to:
//      - onMenuOpen(sub) → setMenuSub(sub) → opens <SubscriptionMenuSheet>
//      - onBack → router.pop()
//   3. <SubscriptionMenuSheet> wired to PATCH/DELETE handlers:
//      - handleTogglePause: PATCH {is_active: !current} → refresh + close menu
//      - handleChangeDay:   PATCH {day_of_month: N} → refresh + close menu
//      - handleChangePrice: PATCH {amount_cents: cents} → refresh + close menu
//      - handleDelete:      DELETE → refresh + close menu
//   4. Loading / error are sub-views (coral-tinted to match the screen).
//
// Reachability:
//   - This Mount can be programmatically pushed via `router.push(<SubscriptionsMount />)`
//     from any caller (e.g. PlanView regulars row in Phase 27 Mgmt-хаб).
//   - On Phase 26 there is no direct bottom-nav entry — Phase 27 will add one.
//
// Failure mode: window.alert (parity with CategoryDetailMount + Plan 28 polish
// will replace with PosterToast).

import { useCallback, useEffect, useState } from 'react';
import { usePosterRouter } from '../common';
import { Eyebrow, PosterButton } from '../../componentsV10';
import {
  listSubscriptionsV10,
  patchSubscriptionV10,
  deleteSubscription,
  type SubscriptionV10Read,
} from '../../api/v10';
import { SubscriptionsView } from './SubscriptionsView';
import { SubscriptionMenuSheet } from './SubscriptionMenuSheet';
import styles from './SubscriptionsView.module.css';

// ─────────────────── State ───────────────────

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; subs: SubscriptionV10Read[] };

// ─────────────────── Component ───────────────────

export function SubscriptionsMount() {
  const router = usePosterRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [menuSub, setMenuSub] = useState<SubscriptionV10Read | null>(null);

  // ─────────── fetch effect ───────────
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const list = await listSubscriptionsV10();
        if (cancelled) return;
        setState({ status: 'ready', subs: list });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Не удалось загрузить подписки';
        setState({ status: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  // ─────────── PATCH/DELETE handlers ───────────
  const handleTogglePause = useCallback(
    async (sub: SubscriptionV10Read) => {
      try {
        await patchSubscriptionV10(sub.id, { is_active: !sub.is_active });
        refresh();
      } catch {
        window.alert('Не удалось обновить статус подписки');
      }
    },
    [refresh],
  );

  const handleChangeDay = useCallback(
    async (sub: SubscriptionV10Read, day: number) => {
      try {
        await patchSubscriptionV10(sub.id, { day_of_month: day });
        refresh();
      } catch {
        window.alert('Не удалось обновить день');
      }
    },
    [refresh],
  );

  const handleChangePrice = useCallback(
    async (sub: SubscriptionV10Read, cents: number) => {
      try {
        await patchSubscriptionV10(sub.id, { amount_cents: cents });
        refresh();
      } catch {
        window.alert('Не удалось обновить цену');
      }
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (sub: SubscriptionV10Read) => {
      try {
        await deleteSubscription(sub.id);
        refresh();
      } catch {
        window.alert('Не удалось удалить подписку');
      }
    },
    [refresh],
  );

  // ─────────── render branches ───────────

  if (state.status === 'loading') {
    return (
      <div className={styles.root} data-testid="subs-loading">
        <div className={styles.headerRow}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => router.pop()}
          >
            ← НАЗАД
          </button>
        </div>
        <div className={styles.eyebrowRow}>
          <Eyebrow color="var(--poster-ink)">SUBSCRIPTIONS</Eyebrow>
        </div>
        <div className={styles.emptyState}>Загрузка…</div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={styles.root} data-testid="subs-error">
        <div className={styles.headerRow}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => router.pop()}
          >
            ← НАЗАД
          </button>
        </div>
        <div className={styles.eyebrowRow}>
          <Eyebrow color="var(--poster-ink)">SUBSCRIPTIONS</Eyebrow>
        </div>
        <div className={styles.emptyState}>{state.message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
          <PosterButton variant="primary" onClick={refresh}>
            ПОВТОРИТЬ
          </PosterButton>
          <PosterButton variant="ghost" onClick={() => router.pop()}>
            НАЗАД
          </PosterButton>
        </div>
      </div>
    );
  }

  return (
    <>
      <SubscriptionsView
        subs={state.subs}
        onMenuOpen={(sub) => setMenuSub(sub)}
        onBack={() => router.pop()}
      />
      <SubscriptionMenuSheet
        sub={menuSub}
        onClose={() => setMenuSub(null)}
        onTogglePause={handleTogglePause}
        onChangeDay={handleChangeDay}
        onChangePrice={handleChangePrice}
        onDelete={handleDelete}
      />
    </>
  );
}
