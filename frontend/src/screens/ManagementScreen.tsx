import { Bell, FileText, Tag, Gear, type Icon } from '@phosphor-icons/react';
import { PageTitle } from '../components/PageTitle';
import styles from './ManagementScreen.module.css';

export type ManagementView = 'subscriptions' | 'template' | 'categories' | 'settings';

export interface ManagementScreenProps {
  onNavigate: (screen: ManagementView) => void;
}

const ICONS: Record<ManagementView, Icon> = {
  subscriptions: Bell,
  template: FileText,
  categories: Tag,
  settings: Gear,
};

const ITEMS: { id: ManagementView; label: string; description: string }[] = [
  { id: 'subscriptions', label: 'Подписки', description: 'Активные подписки и напоминания' },
  { id: 'template', label: 'Шаблон бюджета', description: 'Повторяющийся план для нового периода' },
  { id: 'categories', label: 'Категории', description: 'Управление категориями расходов и доходов' },
  { id: 'settings', label: 'Настройки', description: 'День начала периода, уведомления' },
];

export function ManagementScreen({ onNavigate }: ManagementScreenProps) {
  return (
    <div className={styles.root}>
      <PageTitle title="Управление" />
      <div className={styles.list}>
        {ITEMS.map((item) => {
          const IconComp = ICONS[item.id];
          return (
            <button
              key={item.id}
              type="button"
              className={styles.row}
              onClick={() => onNavigate(item.id)}
            >
              <span className={styles.iconWrap}>
                <IconComp size={36} weight="thin" color="var(--color-primary)" />
              </span>
              <div className={styles.rowText}>
                <div className={styles.rowLabel}>{item.label}</div>
                <div className={styles.rowDesc}>{item.description}</div>
              </div>
              <span className={styles.chevron} aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
