import { useEffect, type ReactNode } from 'react';
import styles from './BottomSheet.module.css';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

// Telegram BackButton typing lives in `frontend/src/api/client.ts` —
// adding it there (rather than re-declaring globals here) avoids the
// "Subsequent property declarations must have the same type" error that
// composite tsc -b raises when two files augment Window.Telegram with
// disjoint shapes.

/**
 * Reusable bottom sheet (sketch 002-B style, Phase 3 D-40).
 *
 * - CSS-only animation (transform: translateY) — no animation libs (D-18).
 * - Tap on backdrop → close.
 * - Esc → close (browser dev fallback).
 * - Telegram BackButton (Mini App) → close; subscribed only while `open`.
 *
 * Used in Phase 3 for full-edit of template/planned items; reused in Phase 4
 * for add-actual-transaction (sketch 002-B).
 *
 * Threat T-03-20: useEffect cleanup hides BackButton + removes listeners on
 * close or unmount, preventing dangling subscriptions across navigations.
 */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    const tgBackBtn = window.Telegram?.WebApp?.BackButton;
    if (tgBackBtn) {
      tgBackBtn.show();
      tgBackBtn.onClick(onClose);
    }

    // Глобальный флаг — BottomNav прячется, пока открыт любой sheet.
    // Без этого dock'а на 30 z-index'е иногда визуально выглядывает из-под
    // sheet'а (наблюдается в Telegram WebView и в desktop-preview), плюс
    // делает невозможным конфликт с FAB / dock area при открытой форме.
    document.body.dataset.sheetOpen = 'true';

    return () => {
      window.removeEventListener('keydown', onKey);
      if (tgBackBtn) {
        tgBackBtn.offClick(onClose);
        tgBackBtn.hide();
      }
      delete document.body.dataset.sheetOpen;
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`${styles.sheet} ${open ? styles.sheetOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.handle} />
        <div className={styles.head}>
          <h3 className={styles.title}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeBtn}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>
  );
}
