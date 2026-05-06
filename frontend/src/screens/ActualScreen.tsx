import { useState } from 'react';
import { createActual, deleteActual, updateActual } from '../api/actual';
import type { ActualRead, CategoryKind } from '../api/types';
import { ActualEditor } from '../components/ActualEditor';
import { BottomSheet } from '../components/BottomSheet';
import { Fab } from '../components/Fab';
import { useActual } from '../hooks/useActual';
import { useCategories } from '../hooks/useCategories';
import { useCurrentPeriod } from '../hooks/useCurrentPeriod';
import { useSettings } from '../hooks/useSettings';
import styles from './ActualScreen.module.css';

export interface ActualScreenProps {
  onBack?: () => void;
  categoryFilter?: number | null;
  onClearFilter?: () => void;
}

interface SheetState {
  open: boolean;
  mode: 'create' | 'edit';
  item?: ActualRead;
}

const CLOSED_SHEET: SheetState = { open: false, mode: 'create' };

function groupByDate(rows: ActualRead[]) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterdayISO = y.toISOString().slice(0, 10);
  const map = new Map<string, ActualRead[]>();
  for (const r of rows) { const arr = map.get(r.tx_date) ?? []; arr.push(r); map.set(r.tx_date, arr); }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, rs]) => ({
    date,
    label: date === todayISO ? 'Сегодня' : date === yesterdayISO ? 'Вчера' : new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
    rows: rs.sort((a, b) => b.id - a.id),
  }));
}

function formatAmount(cents: number, kind: CategoryKind): string {
  const rubles = (cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return kind === 'income' ? `+${rubles} ₽` : `${rubles} ₽`;
}

export function ActualScreen({ onBack, categoryFilter, onClearFilter }: ActualScreenProps): JSX.Element {
  const { period, loading: perLoading, error: perError } = useCurrentPeriod();
  const { rows, loading, error, refetch } = useActual(period?.id ?? null);
  const { categories } = useCategories(false);
  const { settings } = useSettings();
  const [sheet, setSheet] = useState<SheetState>(CLOSED_SHEET);
  const [toast, setToast] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const maxTxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  const periodLabel = period
    ? `${new Date(period.period_start).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })} — ${new Date(period.period_end).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}`
    : '';

  const filteredRows = categoryFilter != null
    ? rows.filter((r) => r.category_id === categoryFilter)
    : rows;

  const filterCategoryName = categoryFilter != null
    ? (categories.find((c) => c.id === categoryFilter)?.name ?? '—')
    : null;

  const handleSave = async (data: {
    kind: CategoryKind;
    category_id: number;
    amount_cents: number;
    description: string | null;
    tx_date: string;
  }) => {
    setMutationError(null);
    try {
      if (sheet.mode === 'create') {
        await createActual(data);
        showToast('Транзакция добавлена');
      } else if (sheet.item) {
        await updateActual(sheet.item.id, data);
        showToast('Транзакция обновлена');
      }
      setSheet(CLOSED_SHEET);
      await refetch();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  };

  const handleDelete = async () => {
    if (!sheet.item) return;
    setMutationError(null);
    try {
      await deleteActual(sheet.item.id);
      setSheet(CLOSED_SHEET);
      showToast('Транзакция удалена');
      await refetch();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : String(e));
    }
  };

  if (perLoading) {
    return <div className={styles.muted}>Загрузка периода…</div>;
  }
  if (perError) {
    return <div className={styles.error}>Ошибка периода: {perError}</div>;
  }

  const groups = groupByDate(filteredRows);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        {onBack && (
          <button type="button" onClick={onBack} className={styles.backBtn} aria-label="Назад">←</button>
        )}
        <div className={styles.titleBlock}>
          <div className={styles.title}>История</div>
          {periodLabel && <div className={styles.subtitle}>{periodLabel}</div>}
        </div>
      </header>

      {filterCategoryName && (
        <div className={styles.filterBadge}>
          <span className={styles.filterLabel}>Категория: {filterCategoryName}</span>
          {onClearFilter && (
            <button type="button" className={styles.filterClear} onClick={onClearFilter} aria-label="Сбросить фильтр">
              ✕
            </button>
          )}
        </div>
      )}

      {error && <div className={styles.error}>Ошибка загрузки: {error}</div>}
      {mutationError && <div className={styles.error}>Ошибка: {mutationError}</div>}

      {loading && <div className={styles.muted}>Загрузка…</div>}

      {!loading && groups.length === 0 && (
        <div className={styles.empty}>
          {filterCategoryName
            ? `Нет транзакций в категории «${filterCategoryName}»`
            : 'Пока нет транзакций. Нажмите + чтобы добавить.'}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.date} className={styles.dateGroup}>
          <div className={styles.dateLabel}>{g.label}</div>
          {g.rows.map((row) => {
            const cat = categories.find((c) => c.id === row.category_id);
            return (
              <button
                key={row.id}
                type="button"
                className={`${styles.row} ${row.kind === 'income' ? styles.incomeRow : ''}`}
                onClick={() => setSheet({ open: true, mode: 'edit', item: row })}
              >
                <span className={styles.amount}>{formatAmount(row.amount_cents, row.kind)}</span>
                <span className={styles.category}>{cat?.name ?? '—'}</span>
                {row.description && <span className={styles.desc}>{row.description}</span>}
              </button>
            );
          })}
        </div>
      ))}

      {toast && <div className={styles.toast}>{toast}</div>}

      <Fab onClick={() => setSheet({ open: true, mode: 'create' })} ariaLabel="Добавить транзакцию" />

      <BottomSheet
        open={sheet.open}
        onClose={() => setSheet(CLOSED_SHEET)}
        title={sheet.mode === 'edit' ? 'Изменить транзакцию' : 'Новая транзакция'}
      >
        <ActualEditor
          initial={sheet.item ? {
            kind: sheet.item.kind,
            amount_cents: sheet.item.amount_cents,
            description: sheet.item.description,
            category_id: sheet.item.category_id,
            tx_date: sheet.item.tx_date,
          } : undefined}
          categories={categories}
          onSave={handleSave}
          onDelete={sheet.mode === 'edit' ? handleDelete : undefined}
          onCancel={() => setSheet(CLOSED_SHEET)}
          maxTxDate={maxTxDate}
          aiEnabled={settings?.enable_ai_categorization ?? false}
        />
      </BottomSheet>
    </div>
  );
}
