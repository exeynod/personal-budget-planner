import { useState } from 'react';
import { createActual } from '../api/actual';
import type { CategoryKind } from '../api/types';
import { ActualEditor } from '../components/ActualEditor';
import { BottomSheet } from '../components/BottomSheet';
import { Fab } from '../components/Fab';
import { useCategories } from '../hooks/useCategories';
import { useCurrentPeriod } from '../hooks/useCurrentPeriod';
import styles from './HomeScreen.module.css';

export interface HomeScreenProps {
  onNavigate: (screen: 'categories' | 'template' | 'planned' | 'actual' | 'settings') => void;
}

/**
 * Home/dashboard placeholder.
 *
 * The real dashboard arrives in Phase 5 (DSH-*); for now Home exposes
 * navigation buttons to the screens that exist today: Categories (Phase 2),
 * Шаблон / План / Факт (Phase 3/4), Settings (Phase 2).
 *
 * Quick-add FAB opens ActualEditor bottom sheet for fast expense entry.
 */
export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const { period } = useCurrentPeriod();
  const { categories } = useCategories(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const maxTxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  const handleSave = async (data: {
    kind: CategoryKind;
    category_id: number;
    amount_cents: number;
    description: string | null;
    tx_date: string;
  }) => {
    await createActual(data);
    setSheetOpen(false);
    showToast('Транзакция добавлена');
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.title}>TG Budget</div>
      </header>
      <div className={styles.placeholder}>
        Дашборд будет в Phase 5.
        <br />
        Сейчас доступны категории, шаблон, план, факт и настройки.
      </div>
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => onNavigate('categories')}
        >
          Категории
        </button>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => onNavigate('template')}
        >
          Шаблон
        </button>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => onNavigate('planned')}
        >
          План
        </button>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => onNavigate('actual')}
        >
          Факт
        </button>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => onNavigate('settings')}
        >
          Настройки
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}

      {period && (
        <Fab onClick={() => setSheetOpen(true)} ariaLabel="Добавить факт-трату" />
      )}

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Новая транзакция"
      >
        <ActualEditor
          categories={categories}
          onSave={handleSave}
          onCancel={() => setSheetOpen(false)}
          maxTxDate={maxTxDate}
        />
      </BottomSheet>
    </div>
  );
}
