import styles from './SubTabBar.module.css';

export type SubTabId = 'history' | 'plan';

export interface SubTabItem<T extends string = SubTabId> {
  id: T;
  label: string;
}

export interface SubTabBarProps<T extends string = SubTabId> {
  active: T;
  onChange: (tab: T) => void;
  tabs: SubTabItem<T>[];
}

export function SubTabBar<T extends string = SubTabId>({ active, onChange, tabs }: SubTabBarProps<T>) {
  return (
    <div className={styles.bar} role="tablist">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={[styles.tab, active === id ? styles.active : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
