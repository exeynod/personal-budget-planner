// 0034 — reusable icon picker.
//
// A grid of the preset category icons (the stable bins exported from
// utils/categoryVisuals.ts). Each cell is a coloured rounded tile with the
// phosphor glyph; the selected key gets a ring. Pure presentational — the
// caller owns the `value` (icon key) + `onChange`.

import { memo } from 'react';
import { CATEGORY_ICON_OPTIONS } from '../../utils/categoryVisuals';
import styles from './IconPicker.module.css';

export interface IconPickerProps {
  /** Currently selected icon key (null/undefined → none selected). */
  value?: string | null;
  /** Tap callback — receives the chosen icon key. */
  onChange: (key: string) => void;
  testId?: string;
}

function IconPickerInner({ value, onChange, testId }: IconPickerProps) {
  return (
    <div
      className={styles.grid}
      role="radiogroup"
      aria-label="Выбор иконки категории"
      data-testid={testId ?? 'icon-picker'}
    >
      {CATEGORY_ICON_OPTIONS.map((opt) => {
        const { key, label, Icon, color } = opt;
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            className={`${styles.cell} ${selected ? styles.cellSelected : ''}`}
            onClick={() => onChange(key)}
            data-testid={`icon-picker-${key}`}
          >
            <span
              className={styles.tile}
              style={{ background: color }}
              aria-hidden="true"
            >
              <Icon size={20} weight="fill" color="#fff" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const IconPicker = memo(IconPickerInner);
