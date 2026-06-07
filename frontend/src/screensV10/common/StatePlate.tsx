// StatePlate — the single parameterised loading / error plate shared by the
// v10 Mounts. Originally a Maximal-Poster surface (Eyebrow + PosterButton); now
// that Liquid Glass is the only web design it renders a native iOS plate using
// the --lgn-* tokens and NativeButton.
//
// The colour props (`background`/`color`/`eyebrowColor`) are still accepted for
// API stability, but they now default to the neutral Liquid Glass surface so a
// caller that passes nothing gets a correct native plate. Home routes its own
// ink vars through them so the plate matches the rest of that screen.

import type { CSSProperties, ReactNode } from 'react';
import { NativeButton } from '../native/NativeButton';

export interface StatePlateProps {
  variant: 'loading' | 'error';
  /** Surface background (CSS value). Default: native grouped background. */
  background?: string;
  /** Foreground ink (CSS value). Default: native label ink. */
  color?: string;
  /** Eyebrow ink (CSS value). Defaults to the native secondary-label ink. */
  eyebrowColor?: string;
  /** Error message (variant='error' only). */
  message?: string;
  /** Retry handler — renders the «Повторить» button when provided. */
  onRetry?: () => void;
  /** Optional back handler — renders a ghost «Назад» button beside retry. */
  onBack?: () => void;
  /** data-testid on the root plate (e.g. 'cat-detail-loading'). */
  testId?: string;
  /** Extra node appended below the action row (rarely needed). */
  children?: ReactNode;
}

const DEFAULT_BG = 'var(--lgn-bg)';
const DEFAULT_INK = 'var(--lgn-ink)';
const DEFAULT_EYEBROW = 'var(--lgn-ink-2)';

const FONT = 'var(--lgn-font), system-ui, sans-serif';

export function StatePlate({
  variant,
  background = DEFAULT_BG,
  color = DEFAULT_INK,
  eyebrowColor,
  message,
  onRetry,
  onBack,
  testId,
  children,
}: StatePlateProps) {
  const fillStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background,
    color,
    padding: '64px 20px 96px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    textAlign: 'center',
    fontFamily: FONT,
  };
  const ebColor = eyebrowColor ?? DEFAULT_EYEBROW;
  const eyebrowStyle: CSSProperties = {
    color: ebColor,
    font: 'var(--lgn-t-footnote)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  if (variant === 'loading') {
    return (
      <div style={fillStyle} data-testid={testId}>
        <div style={eyebrowStyle}>Загрузка</div>
        <div style={{ font: 'var(--lgn-t-title3)', opacity: 0.5 }}>···</div>
        {children}
      </div>
    );
  }

  // variant === 'error'
  return (
    <div style={fillStyle} data-testid={testId}>
      <div style={eyebrowStyle}>Ошибка</div>
      <div
        style={{
          font: 'var(--lgn-t-subhead)',
          opacity: 0.85,
          maxWidth: 320,
          wordBreak: 'break-word',
        }}
      >
        {message}
      </div>
      {(onRetry || onBack) && (
        <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
          {onRetry && (
            <NativeButton variant="primary" onClick={onRetry}>
              Повторить
            </NativeButton>
          )}
          {onBack && (
            <NativeButton variant="ghost" onClick={onBack}>
              Назад
            </NativeButton>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
