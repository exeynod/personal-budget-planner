// Phase 25-04: Inline WIP placeholder views for push routes that real
// implementations land in later plans / phases.
//
// Each placeholder is a fully-qualified poster screen (absolute-fill
// background + Eyebrow + Mass headline) so the PosterRouter slide-in
// animation has something visible to render. They are intentionally
// non-functional — `usePosterRouter().pop` from any of them returns to
// the previous screen.
//
// Replacement matrix:
//   - <AccountsListPlaceholder>      → Phase 27 mgmt screens
//   - <PlanViewPlaceholder>          → Phase 26 plan editor
//   - <CategoryDetailPlaceholder>    → Phase 26 cat detail / plan editor
//   - <TransactionsViewPlaceholder>  → Plan 25-06 (real TransactionsView)
//
// All 4 placeholders are exported individually so callers can `push(<X/>)`
// and we can swap the inner reference (in HomeMount) per replacement plan
// without touching the placeholder export shape.

import type { CSSProperties } from 'react';
import { Eyebrow, Mass } from '../componentsV10';
// WR-25-07 (review fix): use the soft-fallback variant so placeholders
// can be rendered standalone (Storybook / preview) without requiring a
// surrounding `<PosterRouterProvider>`. Production callsites still get
// the full router (back button visible); standalone callsites just hide
// the back button.
import { usePosterRouterOptional } from './common';

// ─────────── shared layout helper ───────────

interface PlaceholderShellProps {
  bg?: string;            // CSS color (default cream)
  fg?: string;            // CSS color for text (default ink on cream)
  eyebrow: string;
  headline: string;
  hint: string;           // e.g. «Replaced in Plan 25-06»
}

function PlaceholderShell({ bg = 'var(--poster-cream)', fg = 'var(--poster-ink)', eyebrow, headline, hint }: PlaceholderShellProps) {
  const router = usePosterRouterOptional();
  const root: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: bg,
    color: fg,
    padding: '56px 22px 90px',
    overflow: 'auto',
    fontFamily: 'var(--poster-font-manrope), system-ui, sans-serif',
  };
  const headerRow: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  };
  const backLink: CSSProperties = {
    fontFamily: 'var(--poster-font-jet-brains-mono), ui-monospace, monospace',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    opacity: 0.7,
    color: fg,
  };
  const hintStyle: CSSProperties = {
    marginTop: 14,
    fontFamily: 'var(--poster-font-jet-brains-mono), ui-monospace, monospace',
    fontSize: 11,
    letterSpacing: '0.06em',
    opacity: 0.6,
  };
  return (
    <div style={root}>
      <div style={headerRow}>
        <Eyebrow color={fg}>{eyebrow}</Eyebrow>
        {router && router.canPop && (
          <span
            style={backLink}
            onClick={router.pop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') router.pop();
            }}
          >
            ← НАЗАД
          </span>
        )}
      </div>
      <Mass italic size={56} style={{ color: fg, lineHeight: 1.05 }}>
        {headline}
      </Mass>
      <div style={hintStyle}>{hint}</div>
    </div>
  );
}

// ─────────── concrete placeholders ───────────

export function AccountsListPlaceholder() {
  return (
    <PlaceholderShell
      eyebrow="ACCOUNTS"
      headline="Кошельки —"
      hint="WIP — Accounts list (Phase 27)"
    />
  );
}

export function PlanViewPlaceholder() {
  return (
    <PlaceholderShell
      eyebrow="PLAN"
      headline="План мая —"
      hint="WIP — Plan editor (Phase 26)"
    />
  );
}

export interface CategoryDetailPlaceholderProps {
  catId: number;
}

export function CategoryDetailPlaceholder({ catId }: CategoryDetailPlaceholderProps) {
  return (
    <PlaceholderShell
      eyebrow={`CATEGORY · #${catId}`}
      headline="Категория —"
      hint={`WIP — Category #${catId} detail (Phase 26)`}
    />
  );
}

export function TransactionsViewPlaceholder() {
  return (
    <PlaceholderShell
      bg="var(--poster-cobalt)"
      fg="var(--poster-paper)"
      eyebrow="SECTION II"
      headline="Реестр —"
      hint="WIP — Transactions registry (Plan 25-06)"
    />
  );
}
