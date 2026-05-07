import { Bell, FileText, Tag, Gear, ShieldCheck, type Icon } from '@phosphor-icons/react';
import { PageTitle } from '../components/PageTitle';
import { useUser } from '../hooks/useUser';
import styles from './ManagementScreen.module.css';

export type ManagementView =
  | 'subscriptions'
  | 'template'
  | 'categories'
  | 'settings'
  | 'access';

export interface ManagementScreenProps {
  onNavigate: (screen: ManagementView) => void;
}

const ICONS: Record<ManagementView, Icon> = {
  subscriptions: Bell,
  template: FileText,
  categories: Tag,
  settings: Gear,
  access: ShieldCheck,
};

interface Item {
  id: ManagementView;
  label: string;
  description: string;
  ownerOnly?: boolean;
}

const ITEMS: Item[] = [
  { id: 'subscriptions', label: 'Подписки', description: 'Регулярные платежи и напоминания' },
  { id: 'template', label: 'Шаблон бюджета', description: 'Повторяющийся план для нового периода' },
  { id: 'categories', label: 'Категории', description: 'Управление категориями расходов и доходов' },
  { id: 'settings', label: 'Настройки', description: 'День начала периода, уведомления' },
  { id: 'access', label: 'Доступ', description: 'Whitelist пользователей и AI usage', ownerOnly: true },
];

/**
 * Management hub. Phase 13 ADM-01: пункт «Доступ» visible только для owner —
 * useUser().role читается из /me (Phase 12 ROLE-05). Member-роль фильтрует
 * пункт прежде чем рендерить — защита уровня UX, не security (backend
 * require_owner отдаёт 403 для всех admin-роутов).
 */
export function ManagementScreen({ onNavigate }: ManagementScreenProps) {
  const { user } = useUser();
  const isOwner = user?.role === 'owner';
  const visibleItems = ITEMS.filter((it) => !it.ownerOnly || isOwner);

  return (
    <div className={styles.root}>
      <PageTitle title="Управление" />
      <div className={styles.list}>
        {visibleItems.map((item) => {
          const IconComp = ICONS[item.id];
          return (
            <button
              key={item.id}
              type="button"
              className={styles.row}
              onClick={() => onNavigate(item.id)}
            >
              <span className={styles.iconWrap}>
                <IconComp size={20} weight="regular" color="var(--color-primary)" />
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
