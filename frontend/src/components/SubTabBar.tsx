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
  /** Стиль активной вкладки.
   *  - 'plain': белый pill (для нейтральных переключателей вроде «История/План»)
   *  - 'accent': accent-tinted gradient (для kind «Расходы/Доходы»). По умолчанию 'plain'. */
  variant?: 'plain' | 'accent';
  /** Тон под фон экрана. По умолчанию 'light'. */
  tint?: 'light' | 'dark';
}

/**
 * SubTabBar — Liquid Glass segmented switcher.
 * Source: screens.jsx HomeA «Расходы/Доходы» + TransactionsScreen «История/План».
 */
export function SubTabBar<T extends string = SubTabId>({
  active,
  onChange,
  tabs,
  variant = 'plain',
  tint = 'light',
}: SubTabBarProps<T>) {
  const rootCls = [
    styles.bar,
    tint === 'dark' ? styles.dark : styles.light,
  ].join(' ');

  return (
    <div className={rootCls} role="tablist">
      {tabs.map(({ id, label }) => {
        const isActive = active === id;
        const tabCls = [
          styles.tab,
          isActive ? styles.active : '',
          isActive && variant === 'accent' ? styles.accent : '',
          isActive && variant === 'plain' ? styles.plain : '',
        ].filter(Boolean).join(' ');
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={tabCls}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
