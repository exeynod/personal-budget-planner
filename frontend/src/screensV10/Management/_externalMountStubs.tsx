// Phase 27-06 — local fallback Mount components used by MgmtHubMount
// when sibling-plan Mounts (AccountsListMount / AnalyticsMount / SavingsMount /
// AiMount) have not yet landed in `screensV10/{Accounts,Analytics,Savings,Ai}/`.
//
// These stubs allow the Mgmt hub navigation to compile + run end-to-end
// against the current tree. Once Phases 27-02 / 27-03 / 27-04 / 27-05 ship
// their real Mount components, the imports in `MgmtHubMount.tsx` and
// `V10MainShell.tsx` should be retargeted at the sibling barrel paths
// (`../Accounts`, `../Ai`, `../Analytics`, `../Savings`).
//
// Visually these stubs match the AccountsListPlaceholder shell — black-on-cream
// with eyebrow + Mass headline + JetBrainsMono hint.

import type { CSSProperties } from 'react';
import { Eyebrow, Mass } from '../../componentsV10';
import { usePosterRouterOptional } from '../common';

interface StubProps {
  bg?: string;
  fg?: string;
  eyebrow: string;
  headline: string;
  hint: string;
}

function Stub({ bg = 'var(--poster-cream)', fg = 'var(--poster-ink)', eyebrow, headline, hint }: StubProps) {
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

export function AccountsListMountStub() {
  return (
    <Stub
      eyebrow="ACCOUNTS / СЧЕТА"
      headline="Счета —"
      hint="WIP — replaced by AccountsListMount when Plan 27-04 lands."
    />
  );
}

export function AnalyticsMountStub() {
  return (
    <Stub
      eyebrow="ANALYTICS / АНАЛИТИКА"
      headline="Месяц —"
      hint="WIP — replaced by AnalyticsMount when Plan 27-05 lands."
    />
  );
}

export function SavingsMountStub() {
  return (
    <Stub
      bg="var(--poster-ink, #0E0E0E)"
      fg="var(--poster-paper, #FFF6E8)"
      eyebrow="SAVINGS / КОПИЛКА"
      headline="Копилка —"
      hint="WIP — replaced by SavingsMount when Plan 27-03 lands."
    />
  );
}

export function AiMountStub() {
  return (
    <Stub
      bg="var(--poster-ink, #0E0E0E)"
      fg="var(--poster-paper, #FFF6E8)"
      eyebrow="AI / ASSISTANT"
      headline="AI —"
      hint="WIP — replaced by AiMount when Plan 27-02 lands."
    />
  );
}
