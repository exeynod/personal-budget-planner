import { FileText, Tag, Gear, type Icon } from '@phosphor-icons/react';
import styles from './MoreScreen.module.css';

type SubScreen = 'categories' | 'template' | 'settings';

export interface MoreScreenProps {
  onNavigate: (screen: SubScreen) => void;
}

const ICONS: Record<SubScreen, Icon> = {
  template: FileText,
  categories: Tag,
  settings: Gear,
};

const ITEMS: { id: SubScreen; label: string; description: string }[] = [
  { id: 'template', label: 'Шаблон бюджета', description: 'Повторяющийся план для нового периода' },
  { id: 'categories', label: 'Категории', description: 'Управление категориями расходов и доходов' },
  { id: 'settings', label: 'Настройки', description: 'День начала периода, уведомления' },
];

export function MoreScreen({ onNavigate }: MoreScreenProps) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>Ещё</div>
      </div>
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
            <span className={styles.icon}><IconComp size={20} weight="thin" color="var(--color-primary)" /></span>
            <div className={styles.rowText}>
              <div className={styles.rowLabel}>{item.label}</div>
              <div className={styles.rowDesc}>{item.description}</div>
            </div>
            <span className={styles.chevron}>›</span>
          </button>
          );
        })}
      </div>
    </div>
  );
}
