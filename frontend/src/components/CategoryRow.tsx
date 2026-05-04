import { useState } from 'react';
import { PencilSimple, Archive } from '@phosphor-icons/react';
import type { CategoryRead } from '../api/types';
import styles from './CategoryRow.module.css';

export interface CategoryRowProps {
  category: CategoryRead;
  onRename: (id: number, newName: string) => Promise<void>;
  onArchive: (id: number) => Promise<void>;
  onUnarchive: (id: number) => Promise<void>;
}

/**
 * Single category list item.
 *
 * Two visual modes:
 *  - read: name + [✎] (rename) + [⊟] (archive) icons; archived rows show
 *    "Восстановить" instead of edit/archive icons and dim opacity 0.5.
 *  - edit: text input with Enter/Esc shortcuts and inline save indicator.
 *
 * Archive flow guarded by `window.confirm` per CAT-02 mitigation
 * (T-fe-confirm-bypass: accepted — user can undo via "Показать архивные" toggle).
 */
export function CategoryRow({ category, onRename, onArchive, onUnarchive }: CategoryRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === category.name) {
      setEditing(false);
      setDraft(category.name);
      return;
    }
    setSaving(true);
    try {
      await onRename(category.id, trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(category.name);
  };

  const handleArchive = async () => {
    if (!window.confirm(`Архивировать категорию «${category.name}»?`)) return;
    await onArchive(category.id);
  };

  const cls = [styles.row, category.is_archived ? styles.archived : ''].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      {editing ? (
        <>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSave();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
              }
            }}
            autoFocus
            disabled={saving}
            className={styles.editInput}
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className={styles.iconBtn}
            aria-label="Сохранить"
          >
            {saving ? '…' : '✓'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className={styles.iconBtn}
            aria-label="Отмена"
          >
            ×
          </button>
        </>
      ) : (
        <>
          <span className={styles.name}>{category.name}</span>
          {category.is_archived ? (
            <button
              type="button"
              onClick={() => void onUnarchive(category.id)}
              className={styles.restoreBtn}
            >
              Восстановить
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={styles.iconBtn}
                aria-label="Переименовать"
              >
                <PencilSimple size={18} weight="thin" />
              </button>
              <button
                type="button"
                onClick={() => void handleArchive()}
                className={styles.iconBtn}
                aria-label="Архивировать"
              >
                <Archive size={18} weight="thin" />
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
