import { House, ListBullets, Sparkle, Gear, Plus } from '@phosphor-icons/react';
import styles from './BottomNav.module.css';

export type TabId = 'home' | 'transactions' | 'ai' | 'management';

/** Тон таб-бара под фон экрана: 'light' для Aurora, 'dark' для Mesh/Sunset. */
export type BottomNavTint = 'light' | 'dark';

export interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  /** Клик по центральному FAB — открывает Add-Transaction sheet. */
  onFabClick: () => void;
  fabAriaLabel?: string;
  /** Стилизация под фон текущего экрана. По умолчанию 'light'. */
  tint?: BottomNavTint;
}

type TabIconProps = { id: TabId };

const TabIcon = ({ id }: TabIconProps) => {
  const size = 22;
  if (id === 'home') return <House size={size} weight="regular" />;
  if (id === 'transactions') return <ListBullets size={size} weight="regular" />;
  if (id === 'ai') return <Sparkle size={size} weight="regular" />;
  return <Gear size={size} weight="regular" />;
};

const TABS_LEFT: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Главная' },
  { id: 'transactions', label: 'Транзакции' },
];

const TABS_RIGHT: { id: TabId; label: string }[] = [
  { id: 'ai', label: 'AI' },
  { id: 'management', label: 'Управление' },
];

export function BottomNav({
  activeTab,
  onTabChange,
  onFabClick,
  fabAriaLabel = 'Добавить транзакцию',
  tint = 'light',
}: BottomNavProps) {
  return (
    <nav
      className={`${styles.dock} ${tint === 'dark' ? styles.dockDark : styles.dockLight}`}
      aria-label="Навигация"
    >
      {TABS_LEFT.map((tab) => (
        <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => onTabChange(tab.id)} />
      ))}

      <button
        type="button"
        className={styles.fabSlot}
        onClick={onFabClick}
        aria-label={fabAriaLabel}
      >
        <Plus size={22} weight="bold" color="#fff" />
      </button>

      {TABS_RIGHT.map((tab) => (
        <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => onTabChange(tab.id)} />
      ))}
    </nav>
  );
}

interface TabButtonProps {
  tab: { id: TabId; label: string };
  active: boolean;
  onClick: () => void;
}

function TabButton({ tab, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.tab} ${active ? styles.active : ''}`}
      onClick={onClick}
      aria-label={tab.label}
      aria-current={active ? 'page' : undefined}
    >
      <span className={styles.icon}><TabIcon id={tab.id} /></span>
      <span className={styles.label}>{tab.label}</span>
    </button>
  );
}
