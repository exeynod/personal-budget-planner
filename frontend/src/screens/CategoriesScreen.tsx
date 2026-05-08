import { useMemo, useState } from 'react';
import { archiveCategory, createCategory, updateCategory } from '../api/categories';
import { useCategories, invalidateCategories } from '../hooks/useCategories';
import type { CategoryKind, CategoryRead } from '../api/types';
import { AuroraBg } from '../components/AuroraBg';
import { CategoryRow } from '../components/CategoryRow';
import { NewCategoryForm } from '../components/NewCategoryForm';
import { ScreenHeader } from '../components/ScreenHeader';
import styles from './CategoriesScreen.module.css';

export interface CategoriesScreenProps {
  onBack: () => void;
}

interface Group {
  title: string;
  kind: CategoryKind;
  rows: CategoryRead[];
}

/**
 * Categories CRUD screen (CAT-01, CAT-02 UI).
 *
 * Layout: header (back + title + "+ Новая") → optional inline NewCategoryForm
 * → groups Расходы / Доходы (sorted by sort_order, then name) → toggle "Показать архивные".
 *
 * After every successful mutation we call `refetch()` to keep state fresh
 * — single-tenant app, optimistic updates not needed (T-fe-stale-state mitigation).
 */
export function CategoriesScreen({ onBack }: CategoriesScreenProps) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const { categories, loading, error, refetch } = useCategories(includeArchived);

  const groups = useMemo<Group[]>(() => {
    const sortFn = (a: CategoryRead, b: CategoryRead) =>
      a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ru');
    const expense = categories.filter((c) => c.kind === 'expense').sort(sortFn);
    const income = categories.filter((c) => c.kind === 'income').sort(sortFn);
    const result: Group[] = [];
    if (expense.length > 0) result.push({ title: 'Расходы', kind: 'expense', rows: expense });
    if (income.length > 0) result.push({ title: 'Доходы', kind: 'income', rows: income });
    return result;
  }, [categories]);

  const wrap = async (fn: () => Promise<unknown>) => {
    setMutationError(null);
    try {
      await fn();
      await refetch();
      // Notify every other useCategories instance (Home, Plan, Template,
      // Transactions, Subscriptions) so archived/renamed categories vanish
      // immediately instead of after a full page reload.
      invalidateCategories();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCreate = async (name: string, kind: CategoryKind) => {
    await wrap(async () => {
      await createCategory({ name, kind });
      setShowNewForm(false);
    });
  };

  const handleRename = async (id: number, newName: string) => {
    await wrap(() => updateCategory(id, { name: newName }));
  };

  const handleArchive = async (id: number) => {
    await wrap(() => archiveCategory(id));
  };

  const handleUnarchive = async (id: number) => {
    await wrap(() => updateCategory(id, { is_archived: false }));
  };

  return (
    <div className={styles.wrap}>
      <AuroraBg />
      <div className={styles.scroll}>
      <ScreenHeader
        title="Категории"
        onBack={onBack}
        rightAction={
          <button
            type="button"
            onClick={() => setShowNewForm((s) => !s)}
            className={styles.addBtn}
          >
            {showNewForm ? '×' : '+ Новая'}
          </button>
        }
      />

      {showNewForm && (
        <NewCategoryForm onCreate={handleCreate} onCancel={() => setShowNewForm(false)} />
      )}

      {loading && <div className={styles.muted}>Загрузка…</div>}
      {error && <div className={styles.error}>Ошибка: {error}</div>}
      {mutationError && <div className={styles.error}>Ошибка: {mutationError}</div>}

      {!loading && !error && groups.length === 0 && (
        <div className={styles.muted}>
          Нет категорий. Нажмите «+ Новая», чтобы создать первую.
        </div>
      )}

      {groups.map((g) => (
        <section key={g.kind} className={styles.group}>
          <h3 className={styles.groupTitle}>{g.title}</h3>
          {g.rows.map((cat) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              onRename={handleRename}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
            />
          ))}
        </section>
      ))}

      <label className={styles.toggleArchived}>
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        <span>Показать архивные</span>
      </label>
      </div>
    </div>
  );
}
