import { lazy, Suspense, useMemo } from 'react';
import './stylesV10/tokens.css';
import './stylesV10/fonts.css';
import './stylesV10/animations.css';
import styles from './AppV10.module.css';
import { V10MainShell } from './screensV10/V10MainShell';

// Lazy-import preview gallery — keeps prod bundle slim when surface !== 'preview'.
const PreviewApp = lazy(() => import('./preview/PreviewApp'));

export default function AppV10() {
  // Phase 24-10 (ONB-V10-01): App root boots into onboarding by default.
  // Phase 25-06 (HOME-V10-01..06 / ADD-V10-01 / TXN-V10-06): the mount
  // surface now renders <V10MainShell /> — a single root that owns the
  // PosterRouter (with OnboardingMount as the router root, which itself
  // dispatches to OnboardingFlow vs HomeMount based on /me.onboarded_at),
  // BottomNavV10, and the FAB-controlled AddSheet PosterSheet binding.
  //
  // Preview gallery (DesignSystem playground) remains opt-in via
  // `?preview=1` so the live app boots into the v1.0 shell both in dev
  // and prod. Playwright suites set the URL explicitly so they never
  // collide with the gallery.
  const surface = useMemo<'preview' | 'mount'>(() => {
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('preview') === '1'
    ) {
      return 'preview';
    }
    return 'mount';
  }, []);

  if (surface === 'preview') {
    return (
      <div className={styles.shellRoot} data-theme="v10">
        <Suspense
          fallback={<div className={styles.placeholder}>Загрузка превью…</div>}
        >
          <PreviewApp />
        </Suspense>
      </div>
    );
  }

  return (
    <div className={styles.shellRoot} data-theme="v10">
      <V10MainShell />
    </div>
  );
}
