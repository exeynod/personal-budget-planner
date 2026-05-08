import {
  CaretRight,
  ChartBar,
  Stack,
  ListBullets,
  Bag,
  Gear,
  CurrencyRub,
  type Icon,
} from '@phosphor-icons/react';
import { AuroraBg } from '../components/AuroraBg';
import { useUser } from '../hooks/useUser';
import styles from './ManagementScreen.module.css';

export type ManagementView =
  | 'analytics'
  | 'subscriptions'
  | 'template'
  | 'categories'
  | 'settings'
  | 'access';

export interface ManagementScreenProps {
  onNavigate: (screen: ManagementView) => void;
}

const ICONS: Record<ManagementView, Icon> = {
  analytics: ChartBar,
  subscriptions: Stack,
  template: ListBullets,
  categories: Bag,
  settings: Gear,
  access: CurrencyRub,
};

interface Item {
  id: ManagementView;
  label: string;
  description: string;
  ownerOnly?: boolean;
}

const ITEMS: Item[] = [
  { id: 'analytics', label: 'Аналитика', description: 'Тренды и прогноз бюджета' },
  { id: 'subscriptions', label: 'Подписки', description: 'Регулярные платежи и напоминания' },
  { id: 'template', label: 'Шаблон бюджета', description: 'Повторяющийся план для нового периода' },
  { id: 'categories', label: 'Категории', description: 'Структура расходов и доходов' },
  { id: 'settings', label: 'Настройки', description: 'День цикла, напоминания' },
  { id: 'access', label: 'Доступ', description: 'Whitelist пользователей и AI usage', ownerOnly: true },
];

/**
 * Management hub — Liquid Glass Aurora layout.
 * Source: more-screens.jsx ManagementHub.
 *
 * Phase 13 ADM-01: пункт «Доступ» visible только для owner — useUser().role
 * читается из /me (Phase 12 ROLE-05). Member-роль фильтрует пункт прежде
 * чем рендерить — защита уровня UX, не security (backend require_owner
 * отдаёт 403 для всех admin-роутов).
 */
export function ManagementScreen({ onNavigate }: ManagementScreenProps) {
  const { user } = useUser();
  const isOwner = user?.role === 'owner';
  const visibleItems = ITEMS.filter((it) => !it.ownerOnly || isOwner);

  const initial = (user?.tg_username ?? 'У').slice(0, 1).toUpperCase();
  const handle = user?.tg_username ? `@${user.tg_username}` : '—';
  const role = user?.role === 'owner' ? 'owner' : user?.role ?? '—';

  return (
    <div className={styles.wrap}>
      <AuroraBg />
      <div className={`${styles.scroll} fade-bottom`}>
        <div className={styles.header}>
          <h2 className={styles.title}>Управление</h2>
          <div className={styles.subtitle}>Подписки, категории, доступ</div>
        </div>

        {/* Profile card */}
        <div className={`glass-light ${styles.profileCard}`}>
          <div className={styles.profileBody}>
            <div className={styles.avatar}>{initial}</div>
            <div className={styles.profileText}>
              <div className={styles.profileName}>{user?.tg_username ?? 'Пользователь'}</div>
              <div className={styles.profileMeta}>{role} · {handle}</div>
            </div>
            <CaretRight size={16} weight="bold" className={styles.profileChev} />
          </div>
        </div>

        {/* List */}
        <div className={`glass-light ${styles.list}`}>
          {visibleItems.map((item, idx) => {
            const IconComp = ICONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.row} ${idx === 0 ? styles.first : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <span className={styles.iconTile}>
                  <IconComp size={18} weight="regular" />
                </span>
                <div className={styles.rowText}>
                  <div className={styles.rowLabelLine}>
                    <span className={styles.rowLabel}>{item.label}</span>
                    {item.ownerOnly && (
                      <span className={styles.ownerChip}>OWNER</span>
                    )}
                  </div>
                  <div className={styles.rowDesc}>{item.description}</div>
                </div>
                <CaretRight size={14} weight="bold" className={styles.rowChev} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
