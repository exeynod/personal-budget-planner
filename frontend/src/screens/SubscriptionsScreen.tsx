import { useMemo, useState } from 'react';
import { useSubscriptions } from '../hooks/useSubscriptions';
import { useSettings } from '../hooks/useSettings';
import { SubscriptionEditor } from '../components/SubscriptionEditor';
import { MainButton } from '../components/MainButton';
import { formatKopecksWithCurrency } from '../utils/format';
import { createSubscription, updateSubscription, deleteSubscription } from '../api/subscriptions';
import type { SubscriptionRead, SubscriptionCreatePayload, SubscriptionUpdatePayload } from '../api/types';
import styles from './SubscriptionsScreen.module.css';

/**
 * Parse an ISO date string (YYYY-MM-DD) as a local date, avoiding UTC offset.
 * new Date("2026-05-01") parses as UTC midnight and can yield the wrong day
 * in +03:00 timezones (returns Apr 30 in local time).
 */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = parseLocalDate(dateStr);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}


interface EditorState {
  mode: 'create' | 'edit';
  sub?: SubscriptionRead;
}

export interface SubscriptionsScreenProps {
  onBack?: () => void;
}

export function SubscriptionsScreen({ onBack }: SubscriptionsScreenProps) {
  const { subscriptions, loading, mutate } = useSubscriptions();
  const { settings } = useSettings();
  const [editor, setEditor] = useState<EditorState | null>(null);

  const activeCount = useMemo(
    () => subscriptions.filter((s) => s.is_active).length,
    [subscriptions],
  );

  const monthlyLoad = useMemo(
    () =>
      subscriptions
        .filter((s) => s.is_active)
        .reduce(
          (acc, s) =>
            acc + (s.cycle === 'monthly' ? s.amount_cents : Math.round(s.amount_cents / 12)),
          0,
        ),
    [subscriptions],
  );

  const handleCreate = async (payload: SubscriptionCreatePayload | SubscriptionUpdatePayload) => {
    await mutate(() => createSubscription(payload as SubscriptionCreatePayload));
  };

  const handleUpdate =
    (id: number) => async (payload: SubscriptionCreatePayload | SubscriptionUpdatePayload) => {
      await mutate(() => updateSubscription(id, payload as SubscriptionUpdatePayload));
    };

  const handleDelete = (id: number) => async () => {
    await mutate(() => deleteSubscription(id));
  };

  const defaultNotifyDays = settings?.notify_days_before ?? 2;

  return (
    <div className={styles.screen}>
      {/* Header */}
      <header className={styles.header}>
        {onBack && (
          <button type="button" onClick={onBack} className={styles.backBtn} aria-label="Назад">
            ←
          </button>
        )}
        <div className={styles.headerTitle}>Подписки</div>
      </header>

      {/* Hero block */}
      <div className={styles.hero}>
        <div className={styles.heroTitle}>Сводка</div>
        <div className={styles.heroStats}>
          <div>
            <span className={styles.stat}>{activeCount}</span>
            <span className={styles.statLabel}>активных</span>
          </div>
          <div>
            <span className={styles.stat}>{formatKopecksWithCurrency(monthlyLoad)}</span>
            <span className={styles.statLabel}>в месяц</span>
          </div>
        </div>
      </div>

      {/* Upcoming card */}
      <div className={styles.sectionContent}>
        <div className={styles.sectionTitle}>Ближайшие списания</div>
        <Upcoming subscriptions={subscriptions} />
      </div>

      {/* Subscription list */}
      <div className={styles.sectionContent}>
        <div className={styles.sectionTitle}>
          Все подписки ({subscriptions.length})
        </div>

        {loading && <div className={styles.empty}>Загрузка…</div>}

        {!loading && subscriptions.length === 0 && (
          <div className={styles.empty}>Подписок пока нет</div>
        )}

        {subscriptions.map((s) => {
          const days = daysUntil(s.next_charge_date);
          const pillLabel =
            days < 0
              ? 'просрочено'
              : days === 0
              ? 'сегодня'
              : `через ${days} дн.`;

          return (
            <button
              key={s.id}
              className={styles.card}
              onClick={() => setEditor({ mode: 'edit', sub: s })}
              type="button"
            >
              <div className={styles.cardLeft}>
                <div className={styles.cardName}>{s.name}</div>
                <div className={styles.cardMeta}>
                  <span className={styles.cycleBadge}>
                    {s.cycle === 'monthly' ? 'мес' : 'год'}
                  </span>
                  <span className={styles.cardCat}>{s.category.name}</span>
                </div>
              </div>
              <div className={styles.cardRight}>
                <div className={styles.cardAmount}>{formatKopecksWithCurrency(s.amount_cents)}</div>
                <div className={styles.pill}>{pillLabel}</div>
              </div>
            </button>
          );
        })}
      </div>

      <MainButton
        text="+ Добавить подписку"
        enabled={true}
        onClick={() => setEditor({ mode: 'create' })}
      />

      {editor && (
        <SubscriptionEditor
          mode={editor.mode}
          initial={editor.sub}
          defaultNotifyDays={defaultNotifyDays}
          onClose={() => setEditor(null)}
          onSubmit={
            editor.mode === 'create' ? handleCreate : handleUpdate(editor.sub!.id)
          }
          onDelete={editor.mode === 'edit' ? handleDelete(editor.sub!.id) : undefined}
        />
      )}
    </div>
  );
}

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

interface UpcomingProps {
  subscriptions: SubscriptionRead[];
}

function Upcoming({ subscriptions }: UpcomingProps) {
  const items = [...subscriptions]
    .filter((s) => s.is_active && daysUntil(s.next_charge_date) <= s.notify_days_before)
    .sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
    .slice(0, 3);

  if (items.length === 0) {
    return <div className={styles.upcomingEmpty}>Нет предстоящих списаний</div>;
  }

  return (
    <div className={styles.upcomingList}>
      {items.map((s) => {
        const d = parseLocalDate(s.next_charge_date);
        const dateLabel = `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
        return (
          <div key={s.id} className={styles.upcomingRow}>
            <div className={styles.upcomingDate}>{dateLabel}</div>
            <div className={styles.upcomingName}>{s.name}</div>
            <div className={styles.upcomingAmount}>{formatKopecksWithCurrency(s.amount_cents)}</div>
          </div>
        );
      })}
    </div>
  );
}
