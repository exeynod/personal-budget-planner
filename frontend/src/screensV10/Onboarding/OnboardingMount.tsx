// Phase 24-10 (ONB-V10-01 / ONB-V10-06 / ONB-V10-07): conditional gateway.
//
// Mounted at AppV10 root (when surface !== 'preview'). Fetches /me once,
// then dispatches:
//   - me.onboarded_at == null → <OnboardingFlow onComplete={refetch}>
//   - me.onboarded_at != null → <HomePlaceholder /> (Phase 25 will replace)
//
// State machine:
//   - loading      → "ЗАГРУЗКА…"
//   - error        → russian error + "ПОВТОРИТЬ" button
//   - me, !onboard → OnboardingFlow with onComplete that refetches /me
//   - me, onboard  → HomePlaceholder
//
// After successful POST /onboarding/complete, the Final view calls
// onComplete(response). We refetch /me — server has now flipped
// onboarded_at to a real ISO timestamp — so the next render path swaps
// to HomePlaceholder. No client-side optimistic state; refetch is the
// single source of truth (T-24-10-03 — onboarded_at always comes from
// server).
//
// 409 path: Final calls onComplete(null) after showing the toast. We
// still refetch /me; if the server says we're already onboarded, the
// component flips to HomePlaceholder. If somehow not (race), the user
// sees the onboarding flow again with a clean draft (Final has cleared
// localStorage before invoking onComplete).

import { useCallback, useEffect, useState } from 'react';
import { OnboardingFlow } from './OnboardingFlow';
import { getMeV10, type MeV10Response } from '../../api/me';
import styles from './OnboardingMount.module.css';

interface MountState {
  status: 'loading' | 'error' | 'ready';
  me: MeV10Response | null;
  errorMsg: string | null;
}

const INITIAL: MountState = {
  status: 'loading',
  me: null,
  errorMsg: null,
};

/** Тонкая заглушка Home — Phase 25 заменит на реальный экран. */
export function HomePlaceholder() {
  return (
    <div className={styles.gate} data-testid="home-placeholder">
      <div className={styles.eyebrow}>VOL.01 / V1.0 HOME</div>
      <div className={styles.homeTitle}>Готово.</div>
      <div className={styles.homeHint}>
        Home WIP — Phase 25. Onboarding закрыт сервером.
      </div>
    </div>
  );
}

export function OnboardingMount() {
  const [state, setState] = useState<MountState>(INITIAL);

  const refetch = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, status: 'loading', errorMsg: null }));
    try {
      const me = await getMeV10();
      setState({ status: 'ready', me, errorMsg: null });
    } catch {
      // Threat T-24-10-02: never echo raw error body — fixed russian copy.
      setState({
        status: 'error',
        me: null,
        errorMsg: 'не удалось загрузить профиль',
      });
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (state.status === 'loading') {
    return (
      <div className={styles.gate} data-testid="mount-loading">
        <div className={styles.eyebrow}>ЗАГРУЗКА…</div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={styles.gate} data-testid="mount-error">
        <div className={styles.eyebrow}>ОШИБКА</div>
        <div className={styles.message}>{state.errorMsg}</div>
        <button
          type="button"
          className={styles.retryBtn}
          onClick={() => void refetch()}
        >
          Повторить
        </button>
      </div>
    );
  }

  // status === 'ready' — me is non-null in this branch.
  if (state.me === null) return null;

  if (state.me.onboarded_at == null) {
    return (
      <OnboardingFlow
        onComplete={async () => {
          // Both 200 and 409 paths refetch — server is the source of truth.
          await refetch();
        }}
      />
    );
  }

  return <HomePlaceholder />;
}
