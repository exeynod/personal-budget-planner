import { House, ArrowsLeftRight, ChartBar, Sparkle, SquaresFour } from '@phosphor-icons/react';
import styles from './BottomNav.module.css';

export type TabId = 'home' | 'transactions' | 'analytics' | 'ai' | 'management';

export interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

type TabIconProps = { id: TabId; active: boolean };

const TabIcon = ({ id, active }: TabIconProps) => {
  const weight = active ? 'fill' : 'thin';
  const size = 26;
  if (id === 'home') return <House size={size} weight={weight} />;
  if (id === 'transactions') return <ArrowsLeftRight size={size} weight={weight} />;
  if (id === 'analytics') return <ChartBar size={size} weight={weight} />;
  if (id === 'ai') return <Sparkle size={size} weight={weight} />;
  return <SquaresFour size={size} weight={weight} />;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Главная' },
  { id: 'transactions', label: 'Транзакции' },
  { id: 'analytics', label: 'Аналитика' },
  { id: 'ai', label: 'AI' },
  { id: 'management', label: 'Управление' },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className={styles.nav} aria-label="Навигация">
      {TABS.map(({ id, label }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            className={[styles.tab, isActive ? styles.active : '', id === 'ai' ? styles.ai : ''].filter(Boolean).join(' ')}
            onClick={() => onTabChange(id)}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className={styles.icon}><TabIcon id={id} active={isActive} /></span>
            <span className={styles.label}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
