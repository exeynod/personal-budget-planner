import { lazy, Suspense, useMemo } from 'react';
import './stylesV10/tokens.css';
import './stylesV10/fonts.css';
import './stylesV10/animations.css';
import styles from './AppV10.module.css';

// Lazy-import preview gallery — keeps prod bundle slim when surface !== 'preview'.
const PreviewApp = lazy(() => import('./preview/PreviewApp'));

export default function AppV10() {
  const surface = useMemo<'preview' | 'placeholder'>(() => {
    // Preview surface available in dev OR via ?preview=1 query.
    if (import.meta.env.DEV) return 'preview';
    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('preview') === '1'
    ) {
      return 'preview';
    }
    return 'placeholder';
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
      <main className={styles.placeholder}>
        <div className={styles.placeholderEyebrow}>VOL.01 / V1.0 BOOT</div>
        <div className={styles.placeholderTitle}>В разработке.</div>
        <div className={styles.placeholderHint}>
          Сетка экранов появится в Phase 24+. Чтобы посмотреть превью —
          <code> ?preview=1</code> или dev-сборка.
        </div>
      </main>
    </div>
  );
}
