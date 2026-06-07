// Liquid Glass v2 — native iOS button (DESIGN-REVIEW §3.7 / P1-2).
//
// The single native button shared across the shell. Replaces the leaked
// Maximal-Poster `PosterButton` in Management views. SF font, sentence case
// (never uppercase), rounded to the unified --lgn-r-sm step. Variant styling
// mirrors the conventions already proven in SubscriptionMenuSheet:
//   - primary     = accent fill / white text (CTA, «Сохранить», «+»)
//   - secondary   = neutral segment-track fill / ink text
//   - destructive = red-tinted fill / red text (NOT coral poster)
//   - ghost       = transparent / accent text
//
// API is stable — consumed by the Management agent; do not break the prop shape.

import type { ReactNode } from 'react';
import styles from './NativeButton.module.css';

export type NativeButtonVariant =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'ghost';

export interface NativeButtonProps {
  /** Visual style. Defaults to `primary`. */
  variant?: NativeButtonVariant;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Native button type — defaults to `button` (never submits a form by accident). */
  type?: 'button' | 'submit' | 'reset';
  /** Accessible label when the children are non-textual (e.g. an icon). */
  ariaLabel?: string;
  /** `data-testid` for e2e / unit selectors. */
  testId?: string;
  /** Stretch to the container width. */
  fullWidth?: boolean;
}

export function NativeButton({
  variant = 'primary',
  children,
  onClick,
  disabled = false,
  type = 'button',
  ariaLabel,
  testId,
  fullWidth = false,
}: NativeButtonProps) {
  const className = [
    styles.btn,
    styles[variant],
    fullWidth ? styles.fullWidth : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
