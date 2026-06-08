// Liquid Glass v2 — native bottom navigation (owner reference #24/#26).
//
// Two discrete floating glass objects, mirroring the owner's reference shots:
//   1. A floating glass *pill* carrying the sections we work in — Главная /
//      Транзакции / Управление. The active section reads in brand orange
//      (icon + label), like «Inicio» on #24/#26.
//   2. A SEPARATE round glass *bubble* to the right for AI — the owner's
//      «отдельный блок сообщений». Tapping it activates the AI tab.
//
// Icons are thin line phosphor glyphs (weight="regular", a touch heavier when
// active) — closer to the liquid-glass line style of the reference than the
// previous filled set.
//
// Accessibility / e2e: every entry (incl. the AI bubble) stays a
// `role="tab"` button with an `aria-label`, so the existing
// `getByRole('tab', { name })` selectors keep working unchanged.

import {
  House,
  ArrowsLeftRight,
  SquaresFour,
  Sparkle,
} from '@phosphor-icons/react';
import styles from './NativeTabBar.module.css';

export type NativeTabId = 'home' | 'transactions' | 'ai' | 'management';

// Sections that live inside the pill (AI is intentionally excluded — it is the
// separate bubble below).
const PILL_TABS: ReadonlyArray<{
  id: NativeTabId;
  label: string;
  Icon: typeof House;
}> = [
  { id: 'home', label: 'Главная', Icon: House },
  { id: 'transactions', label: 'Транзакции', Icon: ArrowsLeftRight },
  { id: 'management', label: 'Управление', Icon: SquaresFour },
];

export function NativeTabBar({
  active,
  onTab,
}: {
  active: NativeTabId;
  onTab: (id: NativeTabId) => void;
}) {
  const aiActive = active === 'ai';

  return (
    <div className={styles.navRow}>
      {/* ── Sections pill ── */}
      <nav className={styles.pill} aria-label="Разделы">
        {PILL_TABS.map(({ id, label, Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={label}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => onTab(id)}
            >
              <Icon size={24} weight={isActive ? 'bold' : 'regular'} />
              <span className={styles.tabLabel}>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Separate AI bubble ── */}
      <button
        type="button"
        role="tab"
        aria-selected={aiActive}
        aria-label="AI"
        className={`${styles.bubble} ${aiActive ? styles.bubbleActive : ''}`}
        onClick={() => onTab('ai')}
      >
        <Sparkle size={26} weight={aiActive ? 'bold' : 'regular'} />
      </button>
    </div>
  );
}
