import { useEffect, type ReactNode } from 'react';
import styles from './BottomSheet.module.css';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

interface TgBackButton {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        BackButton?: TgBackButton;
      };
    };
  }
}

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

    return () => {
      window.removeEventListener('keydown', onKey);
      if (tgBackBtn) {
        tgBackBtn.offClick(onClose);
        tgBackBtn.hide();
      }
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
