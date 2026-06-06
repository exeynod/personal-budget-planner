// Phase 31 (code-quality): StatePlate — the single parameterised loading /
// error plate the v10 Mounts used to copy-paste. Every Mount declared an
// identical `fillStyle` (absolute inset-0 surface, eyebrow, mono detail line,
// retry button) tinted to its screen colour. This component renders that exact
// markup so the migrated Mounts stay byte-identical under the MP pixel
// snapshots, while letting each pass its colours / message / testId / retry.
//
// Theme note: the colours are passed in as CSS values, NOT hardcoded. Home
// routes them through the ink vars (`--color-home` / `--ink-on-home` /
// `--eyebrow-ink`) so the plate is readable under BOTH Maximal Poster and
// Liquid Glass — StatePlate must never reintroduce a hardcoded paper-on-light
// plate. Defaults match the cobalt drill-down screens (Transactions / Plan /
// CategoryDetail).

import type { CSSProperties, ReactNode } from 'react';
import { Eyebrow, PosterButton } from '../../componentsV10';

export interface StatePlateProps {
  variant: 'loading' | 'error';
  /** Surface background (CSS value). Default: cobalt. */
  background?: string;
  /** Foreground ink (CSS value). Default: paper. */
  color?: string;
  /** Eyebrow ink (CSS value). Defaults to `color`. */
  eyebrowColor?: string;
  /** Error message (variant='error' only). */
  message?: string;
  /** Retry handler — renders the «ПОВТОРИТЬ» button when provided. */
  onRetry?: () => void;
  /** Optional back handler — renders a ghost «НАЗАД» button beside retry. */
  onBack?: () => void;
  /** data-testid on the root plate (e.g. 'cat-detail-loading'). */
  testId?: string;
  /** Extra node appended below the action row (rarely needed). */
  children?: ReactNode;
}

const DEFAULT_BG = 'var(--poster-cobalt)';
const DEFAULT_INK = 'var(--poster-paper)';

const MONO_FONT = 'var(--poster-font-jet-brains-mono), ui-monospace, monospace';

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
    padding: '56px 22px 90px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    fontFamily: 'var(--poster-font-manrope), system-ui, sans-serif',
  };
  const ebColor = eyebrowColor ?? color;

  if (variant === 'loading') {
    return (
      <div style={fillStyle} data-testid={testId}>
        <Eyebrow color={ebColor}>ЗАГРУЗКА</Eyebrow>
        <div
          style={{
            fontFamily: MONO_FONT,
            fontSize: 13,
            opacity: 0.7,
            marginTop: 18,
          }}
        >
          ···
        </div>
        {children}
      </div>
    );
  }

  // variant === 'error'
  return (
    <div style={fillStyle} data-testid={testId}>
      <Eyebrow color={ebColor}>ОШИБКА</Eyebrow>
      <div
        style={{
          fontFamily: MONO_FONT,
          fontSize: 13,
          opacity: 0.85,
          marginTop: 18,
          wordBreak: 'break-word',
        }}
      >
        {message}
      </div>
      {(onRetry || onBack) && (
        <div
          style={
            onBack
              ? { marginTop: 20, display: 'flex', gap: 10 }
              : { marginTop: 20 }
          }
        >
          {onRetry && (
            <PosterButton variant="primary" onClick={onRetry}>
              ПОВТОРИТЬ
            </PosterButton>
          )}
          {onBack && (
            <PosterButton variant="ghost" onClick={onBack}>
              НАЗАД
            </PosterButton>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
