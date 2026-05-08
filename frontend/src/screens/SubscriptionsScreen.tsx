import { useMemo, useState } from 'react';
import { useSubscriptions } from '../hooks/useSubscriptions';
import { useSettings } from '../hooks/useSettings';
import { AuroraBg } from '../components/AuroraBg';
import { ScreenHeader } from '../components/ScreenHeader';
import { SubscriptionEditor } from '../components/SubscriptionEditor';
import { MainButton } from '../components/MainButton';
import { formatKopecksWithCurrency } from '../utils/format';
import { createSubscription, updateSubscription, deleteSubscription } from '../api/subscriptions';
import type {
  SubscriptionRead,
  SubscriptionCreatePayload,
  SubscriptionUpdatePayload,
} from '../api/types';
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

  const handleCreate = async (
    payload: SubscriptionCreatePayload | SubscriptionUpdatePayload,
  ) => {
    await mutate(() => createSubscription(payload as SubscriptionCreatePayload));
  };

  const handleUpdate =
    (id: number) =>
    async (payload: SubscriptionCreatePayload | SubscriptionUpdatePayload) => {
      await mutate(() => updateSubscription(id, payload as SubscriptionUpdatePayload));
    };

  const handleDelete = (id: number) => async () => {
    await mutate(() => deleteSubscription(id));
  };

  const defaultNotifyDays = settings?.notify_days_before ?? 2;

  return (
    <div className={styles.wrap}>
      <AuroraBg />
      <div className={`${styles.scroll} fade-bottom`}>
        <ScreenHeader
          title="Подписки"
          subtitle="Регулярные платежи"
          onBack={onBack ?? (() => undefined)}
        />

        {/* Hero block — total monthly + active count + split-bar */}
        <div className={`glass-light ${styles.hero}`}>
          <div className={styles.heroBody}>
            <div className={styles.heroRow}>
              <div>
                <div className={styles.heroKicker}>в месяц</div>
                <div className={styles.heroValue}>
                  {formatKopecksWithCurrency(monthlyLoad)}
                </div>
              </div>
              <div className={styles.heroCount}>{activeCount} активных</div>
            </div>
            <SplitBar subscriptions={subscriptions.filter((s) => s.is_active)} />
          </div>
        </div>

        {/* Upcoming card */}
        <div className={styles.kicker}>Ближайшие списания</div>
        <Upcoming subscriptions={subscriptions} />

        {/* Subscription list */}
        <div className={styles.kicker}>Все подписки · {subscriptions.length}</div>

        {loading && <div className={styles.muted}>Загрузка…</div>}

        {!loading && subscriptions.length === 0 && (
          <div className={`glass-light ${styles.empty}`}>
            <div className={styles.emptyText}>Подписок пока нет</div>
          </div>
        )}

        {!loading && subscriptions.length > 0 && (
          <div className={`glass-light ${styles.list}`}>
            {subscriptions.map((s, idx) => {
              const days = daysUntil(s.next_charge_date);
              const pillLabel =
                days < 0 ? 'просрочено' : days === 0 ? 'сегодня' : `через ${days} дн.`;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.row} ${idx === 0 ? styles.first : ''} ${
                    !s.is_active ? styles.inactive : ''
                  }`}
                  onClick={() => setEditor({ mode: 'edit', sub: s })}
                >
                  <div className={styles.logo}>
                    {s.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className={styles.rowText}>
                    <div className={styles.rowName}>{s.name}</div>
                    <div className={styles.rowMeta}>
                      <span className={styles.cycleBadge}>
                        {s.cycle === 'monthly' ? 'мес' : 'год'}
                      </span>
                      <span>{s.category.name}</span>
                      <span>·</span>
                      <span>{pillLabel}</span>
                    </div>
                  </div>
                  <div className={styles.rowAmount}>
                    {formatKopecksWithCurrency(s.amount_cents)}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <MainButton
          text="+ Добавить подписку"
          enabled={true}
          onClick={() => setEditor({ mode: 'create' })}
        />
      </div>

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

/* Цветная split-bar над подписками — каждый сегмент пропорционален amt. */
function SplitBar({ subscriptions }: { subscriptions: SubscriptionRead[] }) {
  if (subscriptions.length === 0) return null;
  // Детерминированно подбираем цвет: hash имени → одна из cat-палитр.
  const palette = ['#F39A4C', '#E36B5A', '#B583E8', '#6CA6E8', '#E26F8E', '#F0C04A', '#7CC68F', '#9C8FE8'];
  return (
    <div className={styles.splitBar}>
      {subscriptions.map((s) => {
        let h = 0;
        for (let i = 0; i < s.name.length; i++) h = (h * 31 + s.name.charCodeAt(i)) | 0;
        const color = palette[Math.abs(h) % palette.length];
        return (
          <div
            key={s.id}
            className={styles.splitSeg}
            style={{ flex: s.amount_cents, background: color }}
          />
        );
      })}
    </div>
  );
}

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

interface UpcomingProps {
  subscriptions: SubscriptionRead[];
}

function Upcoming({ subscriptions }: UpcomingProps) {
  const HORIZON_DAYS = 30;
  const items = [...subscriptions]
    .filter((s) => {
      if (!s.is_active) return false;
      const d = daysUntil(s.next_charge_date);
      return d >= 0 && d <= HORIZON_DAYS;
    })
    .sort((a, b) => a.next_charge_date.localeCompare(b.next_charge_date))
    .slice(0, 3);

  if (items.length === 0) {
    return (
      <div className={`glass-light ${styles.upcomingEmpty}`}>
        <div className={styles.upcomingEmptyText}>Нет предстоящих списаний</div>
      </div>
    );
  }

  return (
    <div className={`glass-light ${styles.upcomingList}`}>
      {items.map((s, idx) => {
        const d = parseLocalDate(s.next_charge_date);
        const dateLabel = `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
        return (
          <div
            key={s.id}
            className={`${styles.upcomingRow} ${idx === 0 ? styles.first : ''}`}
          >
            <div className={styles.upcomingDate}>{dateLabel}</div>
            <div className={styles.upcomingName}>{s.name}</div>
            <div className={styles.upcomingAmount}>
              {formatKopecksWithCurrency(s.amount_cents)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
