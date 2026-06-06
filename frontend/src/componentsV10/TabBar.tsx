import { FAB } from './FAB';
import styles from './TabBar.module.css';

export type TabId = 'home' | 'ai' | 'mgmt';

interface TabEntry {
  id: TabId;
  label: string;
  glyph: string;
  idx: number;
}

const TABS: TabEntry[] = [
  { id: 'home', label: 'ГЛАВНАЯ', glyph: '■', idx: 0 },
  { id: 'ai', label: 'AI', glyph: '✦', idx: 3 },
  { id: 'mgmt', label: 'УПР.', glyph: '⌘', idx: 4 },
];

export interface TabBarProps {
  active: TabId;
  dark?: boolean; // dark=true → black bg + paper text + yellow active
  onTab: (id: TabId) => void;
  onFab: () => void;
}

export function TabBar({ active, dark = false, onTab, onFab }: TabBarProps) {
  const activeIdx = TABS.find((t) => t.id === active)?.idx ?? 0;
  return (
    <nav
      className={`${styles.tabBar}${dark ? ' ' + styles.dark : ' ' + styles.light}`}
      role="tablist"
      aria-label="Bottom navigation"
    >
      <div
        className={styles.indicator}
        style={{ left: `calc(${activeIdx} * (100% / 5))` }}
      />
      {[TABS[0]].map((t) => (
        <TabBtn key={t.id} t={t} active={active === t.id} onTab={onTab} />
      ))}
      <div className={styles.fabSlot}>
        <FAB onClick={onFab} />
      </div>
      {[TABS[1], TABS[2]].map((t) => (
        <TabBtn key={t.id} t={t} active={active === t.id} onTab={onTab} />
      ))}
    </nav>
  );
}

function TabBtn({
  t,
  active,
  onTab,
}: {
  t: TabEntry;
  active: boolean;
  onTab: (id: TabId) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`${styles.tab}${active ? ' ' + styles.active : ''}`}
      onClick={() => onTab(t.id)}
    >
      <span className={`${styles.glyph}${active ? ' poster-tab-pop' : ''}`}>
        {t.glyph}
      </span>
      <span className={styles.label}>{t.label}</span>
    </button>
  );
}
