import { useMemo, useState } from 'react';
import { useSubscriptions } from '../hooks/useSubscriptions';
import { useSettings } from '../hooks/useSettings';
import { SubscriptionEditor } from '../components/SubscriptionEditor';
import { MainButton } from '../components/MainButton';
import { formatKopecksWithCurrency } from '../utils/format';
import { createSubscription, updateSubscription, deleteSubscription } from '../api/subscriptions';
import type { SubscriptionRead, SubscriptionCreatePayload, SubscriptionUpdatePayload } from '../api/types';
import styles from './SubscriptionsScreen.module.css';

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function pillClass(days: number): string {
  if (days <= 2) return styles.danger;
  if (days <= 7) return styles.warn;
  return styles.neutral;
}

interface EditorState {
  mode: 'create' | 'edit';
  sub?: SubscriptionRead;
}

export function SubscriptionsScreen() {
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
      {/* Hero block */}
      <div className={styles.hero}>
        <div className={styles.heroTitle}>Подписки</div>
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

      {/* Timeline card */}
      <div className={styles.sectionContent}>
        <div className={styles.sectionTitle}>Ближайшие списания</div>
        <Timeline subscriptions={subscriptions.filter((s) => s.is_active)} />
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
                <div className={`${styles.pill} ${pillClass(days)}`}>{pillLabel}</div>
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

interface TimelineProps {
  subscriptions: SubscriptionRead[];
}

function Timeline({ subscriptions }: TimelineProps) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDay = today.getDate();
  const todayPct = ((todayDay - 1) / (daysInMonth - 1)) * 100;

  const dotsThisMonth = subscriptions.filter((s) => {
    const d = new Date(s.next_charge_date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  return (
    <div className={styles.timeline}>
      <div className={styles.timelineLine} />
      <div className={styles.todayLine} style={{ left: `${todayPct}%` }} />
      {dotsThisMonth.map((s) => {
        const d = new Date(s.next_charge_date).getDate();
        const pct = ((d - 1) / (daysInMonth - 1)) * 100;
        const days = daysUntil(s.next_charge_date);
        return (
          <div
            key={s.id}
            className={`${styles.dot} ${pillClass(days)}`}
            style={{ left: `${pct}%` }}
            title={`${s.name}: ${s.next_charge_date}`}
          />
        );
      })}
    </div>
  );
}
