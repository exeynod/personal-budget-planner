// Liquid Glass v2 — native iOS toast.
//
// Replaces the Maximal-Poster `Toast` (yellow, JetBrains Mono, uppercase,
// border-radius:0) inside native screens (Plan, CategoryDetail, Template).
// Design-review §2.2 / §P0-2 / §3.7: a soft glass capsule — SF font, sentence
// case, rounded pill, ✓ / ⚠ icon, auto-dismiss. Same minimal API surface as the
// poster Toast (message / visible / onDismiss / duration) so it drops in
// without touching call-site state shapes.

import { useEffect } from 'react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import styles from './NativeToast.module.css';

export interface NativeToastProps {
  message: string;
  visible: boolean;
  onDismiss?: () => void;
  /** Auto-dismiss delay in ms (default 1900). */
  duration?: number;
  /** Visual tone — drives the leading glyph (✓ success / ⚠ error). */
  tone?: 'success' | 'error';
}

export function NativeToast({
  message,
  visible,
  onDismiss,
  duration = 1900,
  tone = 'success',
}: NativeToastProps) {
  useEffect(() => {
    if (!visible || !onDismiss) return;
    const t = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(t);
  }, [visible, onDismiss, duration, message]);

  if (!visible) return null;

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div
        className={`${styles.toast} ${styles[tone]}`}
        data-testid="native-toast"
      >
        <span className={styles.icon} aria-hidden="true">
          {tone === 'error' ? (
            <WarningCircle size={18} weight="fill" />
          ) : (
            <CheckCircle size={18} weight="fill" />
          )}
        </span>
        <span className={styles.label}>{message}</span>
      </div>
    </div>
  );
}
