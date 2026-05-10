import type { CSSProperties, ReactNode } from 'react';
import styles from './PosterButton.module.css';

export type PosterButtonVariant = 'primary' | 'ghost' | 'destructive';

export interface PosterButtonProps {
  variant: PosterButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  type?: 'button' | 'submit';
}

export function PosterButton({
  variant,
  onClick,
  disabled = false,
  children,
  className,
  style,
  type = 'button',
}: PosterButtonProps) {
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`${styles.btn} ${styles['v-' + variant]}${
        disabled ? ' ' + styles.disabled : ''
      }${className ? ' ' + className : ''}`}
      style={style}
    >
      {children}
    </button>
  );
}
