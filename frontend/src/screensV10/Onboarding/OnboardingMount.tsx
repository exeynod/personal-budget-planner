// Phase 24-10 (ONB-V10-01 / ONB-V10-06 / ONB-V10-07): conditional gateway.
// Phase 25-06: HomePlaceholder replaced by HomeMount; gateway logic
// (loading / error / OnboardingFlow / Home) is unchanged. OnboardingMount
// is now mounted as the PosterRouter root inside V10MainShell, so HomeMount
// (rendered in the onboarded branch below) finds usePosterRouter() in
// context and can push child screens.
//
// Mounted at AppV10 root via V10MainShell (when surface !== 'preview').
// Fetches /me once, then dispatches:
//   - me.onboarded_at == null → <OnboardingFlow onComplete={refetch}>
//   - me.onboarded_at != null → <HomeMount /> (real Home, replaced placeholder)
//
// State machine:
//   - loading      → "ЗАГРУЗКА…"
//   - error        → russian error + "ПОВТОРИТЬ" button
//   - me, !onboard → OnboardingFlow with onComplete that refetches /me
//   - me, onboard  → HomeMount
//
// After successful POST /onboarding/complete, the Final view calls
// onComplete(response). We refetch /me — server has now flipped
// onboarded_at to a real ISO timestamp — so the next render path swaps
// to HomeMount. No client-side optimistic state; refetch is the single
// source of truth (T-24-10-03 — onboarded_at always comes from server).
//
// 409 path: Final calls onComplete(null) after showing the toast. We
// still refetch /me; if the server says we're already onboarded, the
// component flips to HomeMount. If somehow not (race), the user sees
// the onboarding flow again with a clean draft (Final has cleared
// localStorage before invoking onComplete).

import { useCallback, useEffect, useState } from 'react';
import { OnboardingFlow } from './OnboardingFlow';
import { getMeV10, type MeV10Response } from '../../api/me';
import { invalidate, CACHE_KEYS } from '../../api/cache';
import { HomeMount } from '../Home';
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

export function OnboardingMount() {
  const [state, setState] = useState<MountState>(INITIAL);

  const refetch = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, status: 'loading', errorMsg: null }));
    try {
      // The gate is the source of truth for onboarding state — always read a
      // FRESH /me (drop any cached value) so the post-onboarding flip
      // (incl. the 409 «already onboarded» path, which doesn't clear the
      // cache) is never masked by a stale `onboarded_at: null`.
      invalidate(CACHE_KEYS.me);
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

  return <HomeMount />;
}
