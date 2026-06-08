// 0034 — native iOS category-management view.
//
// A pushed detail screen (back nav-bar + grouped inset sections):
//   - «Расходы» / «Доходы» section per kind, each a list of the user's
//     categories: CategoryIcon (left, honours the explicit `icon`) + name +
//     tap → edit sheet (rename / change icon / archive).
//   - «+ Добавить» action in each section header → create sheet
//     (name + IconPicker; kind is the section's kind).
//   - «Архив» section (only when archived rows exist): archived categories
//     with an «Вернуть» (unarchive) affordance.
//
// Pure presentational: all data + mutations live in CategoriesMount. Mirrors
// the Settings/Access view conventions (NativeNavBar + InsetGroup/InsetRow +
// data-testid discipline).

import { memo, useState } from 'react';
import {
  NativeNavBar,
  SectionHeader,
  SectionHeaderAction,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { CategoryIcon } from '../native/CategoryIcon';
import { IconPicker } from '../native/IconPicker';
import type { CategoryV10 } from '../../api/v10';
import styles from './NativeCategoriesView.module.css';

export type CategoryKindStr = 'expense' | 'income';

export interface CategoryCreateInput {
  name: string;
  kind: CategoryKindStr;
  icon: string | null;
}

export interface CategoryEditInput {
  name?: string;
  icon?: string | null;
}

export interface CategoriesViewProps {
  categories: CategoryV10[];
  loading: boolean;
  error: string | null;
  /** True while any create/edit/archive request is in flight. */
  busy: boolean;
  onCreate: (input: CategoryCreateInput) => void;
  onEdit: (id: number, input: CategoryEditInput) => void;
  onArchive: (id: number) => void;
  onUnarchive: (id: number) => void;
  onBack: () => void;
}

// Create sheet — inline editor under the section header.
function CreateEditor({
  kind,
  busy,
  onSubmit,
  onCancel,
}: {
  kind: CategoryKindStr;
  busy: boolean;
  onSubmit: (input: CategoryCreateInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const canSubmit = name.trim() !== '' && !busy;

  return (
    <div className={styles.editor} data-testid="category-create-editor">
      <input
        type="text"
        className={styles.nameInput}
        placeholder="Название категории"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={200}
        aria-label="Название новой категории"
        data-testid="category-create-name"
        autoFocus
      />
      <IconPicker
        value={icon}
        onChange={setIcon}
        testId="category-create-icon-picker"
      />
      <div className={styles.editorActions}>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onCancel}
          data-testid="category-create-cancel"
        >
          Отмена
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!canSubmit}
          onClick={() => onSubmit({ name: name.trim(), kind, icon })}
          data-testid="category-create-submit"
        >
          {busy ? '…' : 'Создать'}
        </button>
      </div>
    </div>
  );
}

// Edit sheet — inline editor for an existing category (rename + icon).
function EditEditor({
  category,
  busy,
  onSubmit,
  onArchive,
  onCancel,
}: {
  category: CategoryV10;
  busy: boolean;
  onSubmit: (input: CategoryEditInput) => void;
  onArchive: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState<string | null>(category.icon ?? null);
  const canSubmit = name.trim() !== '' && !busy;

  return (
    <div className={styles.editor} data-testid="category-edit-editor">
      <input
        type="text"
        className={styles.nameInput}
        placeholder="Название категории"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={200}
        aria-label="Название категории"
        data-testid="category-edit-name"
        autoFocus
      />
      <IconPicker
        value={icon}
        onChange={setIcon}
        testId="category-edit-icon-picker"
      />
      <div className={styles.editorActions}>
        <button
          type="button"
          className={styles.dangerBtn}
          disabled={busy}
          onClick={onArchive}
          data-testid="category-edit-archive"
        >
          В архив
        </button>
        <span className={styles.editorActionsRight}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onCancel}
            data-testid="category-edit-cancel"
          >
            Отмена
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={!canSubmit}
            onClick={() => onSubmit({ name: name.trim(), icon })}
            data-testid="category-edit-submit"
          >
            {busy ? '…' : 'Сохранить'}
          </button>
        </span>
      </div>
    </div>
  );
}

function KindSection({
  title,
  kind,
  items,
  busy,
  creating,
  editingId,
  onStartCreate,
  onCancelCreate,
  onCreate,
  onStartEdit,
  onCancelEdit,
  onEdit,
  onArchive,
}: {
  title: string;
  kind: CategoryKindStr;
  items: CategoryV10[];
  busy: boolean;
  creating: boolean;
  editingId: number | null;
  onStartCreate: () => void;
  onCancelCreate: () => void;
  onCreate: (input: CategoryCreateInput) => void;
  onStartEdit: (id: number) => void;
  onCancelEdit: () => void;
  onEdit: (id: number, input: CategoryEditInput) => void;
  onArchive: (id: number) => void;
}) {
  return (
    <>
      <SectionHeader
        trailing={
          <SectionHeaderAction
            onClick={onStartCreate}
            testId={`category-add-${kind}`}
          >
            + Добавить
          </SectionHeaderAction>
        }
      >
        {title}
      </SectionHeader>
      {creating && (
        <InsetGroup>
          <CreateEditor
            kind={kind}
            busy={busy}
            onSubmit={onCreate}
            onCancel={onCancelCreate}
          />
        </InsetGroup>
      )}
      <InsetGroup>
        {items.length === 0 && !creating ? (
          <InsetRow
            title={<span className={styles.muted}>Нет категорий</span>}
            testId={`category-empty-${kind}`}
          />
        ) : (
          items.map((cat) =>
            editingId === cat.id ? (
              <EditEditor
                key={cat.id}
                category={cat}
                busy={busy}
                onSubmit={(input) => onEdit(cat.id, input)}
                onArchive={() => onArchive(cat.id)}
                onCancel={onCancelEdit}
              />
            ) : (
              <InsetRow
                key={cat.id}
                testId={`category-row-${cat.id}`}
                leading={
                  <CategoryIcon name={cat.name} id={cat.id} icon={cat.icon} />
                }
                title={cat.name}
                chevron
                onClick={() => onStartEdit(cat.id)}
              />
            ),
          )
        )}
      </InsetGroup>
    </>
  );
}

function NativeCategoriesViewInner(props: CategoriesViewProps) {
  const {
    categories,
    loading,
    error,
    busy,
    onCreate,
    onEdit,
    onArchive,
    onUnarchive,
    onBack,
  } = props;

  // Which section (if any) is in create-mode, and which row is in edit-mode.
  const [creatingKind, setCreatingKind] = useState<CategoryKindStr | null>(
    null,
  );
  const [editingId, setEditingId] = useState<number | null>(null);

  const active = categories.filter((c) => !c.is_archived);
  const archived = categories.filter((c) => c.is_archived);
  const expense = active.filter((c) => c.kind === 'expense');
  const income = active.filter((c) => c.kind === 'income');

  function startCreate(kind: CategoryKindStr) {
    setEditingId(null);
    setCreatingKind(kind);
  }
  function startEdit(id: number) {
    setCreatingKind(null);
    setEditingId(id);
  }
  function handleCreate(input: CategoryCreateInput) {
    onCreate(input);
    setCreatingKind(null);
  }
  function handleEdit(id: number, input: CategoryEditInput) {
    onEdit(id, input);
    setEditingId(null);
  }
  function handleArchive(id: number) {
    onArchive(id);
    setEditingId(null);
  }

  return (
    <div className={styles.root} data-testid="native-categories-view">
      <NativeNavBar title="Категории" onBack={onBack} />

      {loading && (
        <div className={styles.banner} data-testid="native-categories-loading">
          Загрузка…
        </div>
      )}
      {error && (
        <div
          className={`${styles.banner} ${styles.bannerError}`}
          data-testid="native-categories-error"
        >
          {error}
        </div>
      )}

      <KindSection
        title="Расходы"
        kind="expense"
        items={expense}
        busy={busy}
        creating={creatingKind === 'expense'}
        editingId={editingId}
        onStartCreate={() => startCreate('expense')}
        onCancelCreate={() => setCreatingKind(null)}
        onCreate={handleCreate}
        onStartEdit={startEdit}
        onCancelEdit={() => setEditingId(null)}
        onEdit={handleEdit}
        onArchive={handleArchive}
      />

      <KindSection
        title="Доходы"
        kind="income"
        items={income}
        busy={busy}
        creating={creatingKind === 'income'}
        editingId={editingId}
        onStartCreate={() => startCreate('income')}
        onCancelCreate={() => setCreatingKind(null)}
        onCreate={handleCreate}
        onStartEdit={startEdit}
        onCancelEdit={() => setEditingId(null)}
        onEdit={handleEdit}
        onArchive={handleArchive}
      />

      {archived.length > 0 && (
        <>
          <SectionHeader>Архив</SectionHeader>
          <InsetGroup>
            {archived.map((cat) => (
              <InsetRow
                key={cat.id}
                testId={`category-archived-${cat.id}`}
                leading={
                  <CategoryIcon name={cat.name} id={cat.id} icon={cat.icon} />
                }
                title={<span className={styles.muted}>{cat.name}</span>}
                trailing={
                  <button
                    type="button"
                    className={styles.unarchiveBtn}
                    disabled={busy}
                    onClick={() => onUnarchive(cat.id)}
                    data-testid={`category-unarchive-${cat.id}`}
                  >
                    Вернуть
                  </button>
                }
              />
            ))}
          </InsetGroup>
        </>
      )}
    </div>
  );
}

export const NativeCategoriesView = memo(NativeCategoriesViewInner);
