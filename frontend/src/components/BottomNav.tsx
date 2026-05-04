import { House, Receipt, CalendarBlank, Bell, DotsNine } from '@phosphor-icons/react';
import styles from './BottomNav.module.css';

export type TabId = 'home' | 'history' | 'planned' | 'subscriptions' | 'more';

export interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

type TabIconProps = { id: TabId; active: boolean };

const TabIcon = ({ id, active }: TabIconProps) => {
  const weight = active ? 'fill' : 'thin';
  const size = 26;
  if (id === 'home') return <House size={size} weight={weight} />;
  if (id === 'history') return <Receipt size={size} weight={weight} />;
  if (id === 'planned') return <CalendarBlank size={size} weight={weight} />;
  if (id === 'subscriptions') return <Bell size={size} weight={weight} />;
  return <DotsNine size={size} weight={weight} />;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Главная' },
  { id: 'history', label: 'История' },
  { id: 'planned', label: 'План' },
  { id: 'subscriptions', label: 'Подписки' },
  { id: 'more', label: 'Ещё' },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className={styles.nav} aria-label="Навигация">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className={`${styles.tab} ${activeTab === id ? styles.active : ''}`}
          onClick={() => onTabChange(id)}
          aria-label={label}
          aria-current={activeTab === id ? 'page' : undefined}
        >
          <span className={styles.icon}><TabIcon id={id} active={activeTab === id} /></span>
          <span className={styles.label}>{label}</span>
        </button>
      ))}
    </nav>
  );
}
