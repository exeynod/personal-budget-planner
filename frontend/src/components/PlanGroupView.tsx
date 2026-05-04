import { useState } from 'react';
import type { CategoryKind, CategoryRead } from '../api/types';
import { PlanRow, type PlanRowItem } from './PlanRow';
import styles from './PlanGroupView.module.css';

export interface CategoryEntry {
  category: CategoryRead;
  items: PlanRowItem[];
}

export interface PlanGroupViewProps {
  groups: { kind: CategoryKind; entries: CategoryEntry[] }[];
  onAmountSave: (item: PlanRowItem, cents: number) => Promise<void>;
  onOpenEditor: (item: PlanRowItem) => void;
  onAdd: (categoryId: number) => void;
}

export function PlanGroupView({ groups, onAmountSave, onOpenEditor, onAdd }: PlanGroupViewProps) {
  const [activeKind, setActiveKind] = useState<CategoryKind>('expense');
  const activeGroup = groups.find((g) => g.kind === activeKind);
  const filled = activeGroup?.entries.filter((e) => e.items.length > 0) ?? [];

  return (
    <>
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeKind === 'expense' ? styles.tabActive : ''}`}
          onClick={() => setActiveKind('expense')}
        >
          Расходы
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeKind === 'income' ? styles.tabActive : ''}`}
          onClick={() => setActiveKind('income')}
        >
          Доходы
        </button>
      </div>

      {filled.length === 0 && (
        <div className={styles.empty}>Нет строк. Нажмите «Добавить».</div>
      )}

      {filled.map(({ category, items }) => (
        <div key={category.id} className={styles.categoryGroup}>
          <h4 className={styles.categoryTitle}>{category.name}</h4>
          {items.map((item) => (
            <PlanRow
              key={item.row.id}
              item={item}
              category={category}
              onAmountSave={(cents) => onAmountSave(item, cents)}
              onOpenEditor={() => onOpenEditor(item)}
            />
          ))}
          <button
            type="button"
            onClick={() => onAdd(category.id)}
            className={styles.addInGroup}
          >
            + Добавить строку в {category.name}
          </button>
        </div>
      ))}
    </>
  );
}
