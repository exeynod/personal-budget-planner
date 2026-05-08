import { House, ListBullets, ChartBar, Sparkle, Gear } from '@phosphor-icons/react';
import styles from './BottomNav.module.css';

export type TabId = 'home' | 'transactions' | 'analytics' | 'ai' | 'management';

/** Тон таб-бара под фон экрана: 'light' для Aurora, 'dark' для Mesh/Sunset. */
export type BottomNavTint = 'light' | 'dark';

export interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  /** Стилизация под фон текущего экрана. По умолчанию 'light'. */
  tint?: BottomNavTint;
}

type TabIconProps = { id: TabId };

const TabIcon = ({ id }: TabIconProps) => {
  const size = 22;
  if (id === 'home') return <House size={size} weight="regular" />;
  if (id === 'transactions') return <ListBullets size={size} weight="regular" />;
  if (id === 'analytics') return <ChartBar size={size} weight="regular" />;
  if (id === 'ai') return <Sparkle size={size} weight="regular" />;
  return <Gear size={size} weight="regular" />;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Главная' },
  { id: 'transactions', label: 'Транзакции' },
  { id: 'analytics', label: 'Аналитика' },
  { id: 'ai', label: 'AI' },
  { id: 'management', label: 'Управление' },
];

export function BottomNav({ activeTab, onTabChange, tint = 'light' }: BottomNavProps) {
  return (
    <nav
      className={`${styles.dock} ${tint === 'dark' ? styles.dockDark : styles.dockLight}`}
      aria-label="Навигация"
    >
      {TABS.map(({ id, label }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            className={[styles.tab, isActive ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => onTabChange(id)}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className={styles.icon}><TabIcon id={id} /></span>
            <span className={styles.label}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
