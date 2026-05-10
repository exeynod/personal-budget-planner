import { useEffect } from 'react';
import styles from './Toast.module.css';

export interface ToastProps {
  message: string;
  visible: boolean;
  onDismiss?: () => void;
  duration?: number; // default 1700ms
}

export function Toast({
  message,
  visible,
  onDismiss,
  duration = 1700,
}: ToastProps) {
  useEffect(() => {
    if (!visible || !onDismiss) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [visible, onDismiss, duration]);

  if (!visible) return null;

  return (
    <div
      className={`${styles.toast} poster-toast-in`}
      role="status"
      aria-live="polite"
    >
      <svg className={styles.svg} viewBox="0 0 24 24" width="14" height="14">
        <path
          className="poster-check"
          d="M4 12 L10 18 L20 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="square"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
}
