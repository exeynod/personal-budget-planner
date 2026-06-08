// 0034/0035 — reusable icon + colour pickers.
//
// 0035 split the old bundled {icon+colour} grid into TWO independent pickers
// (iOS-Shortcuts style):
//   - `IconPicker`  — a grid of glyphs (ICON_SET). Picks the `icon` key only;
//      glyphs are tinted with the chosen colour (or a neutral grey) so the
//      preview reflects the live selection.
//   - `ColorPicker` — a row of colour swatches (COLOR_SET). Picks the `color`
//      key only.
// Both are pure presentational — the caller owns `value` + `onChange`.

import { memo } from 'react';
import { ICON_SET, COLOR_SET } from '../../utils/categoryVisuals';
import styles from './IconPicker.module.css';

const NEUTRAL_TILE = 'var(--lgn-fill-secondary, #8e8e93)';

/** Resolve a colour key → hex, for tinting the icon grid preview. */
function colorHexFor(key?: string | null): string {
  if (key == null) return NEUTRAL_TILE;
  const k = key.trim().toLowerCase();
  return COLOR_SET.find((c) => c.key === k)?.color ?? NEUTRAL_TILE;
}

export interface IconPickerProps {
  /** Currently selected icon key (null/undefined → none selected). */
  value?: string | null;
  /** Tap callback — receives the chosen icon key. */
  onChange: (key: string) => void;
  /**
   * 0035: currently selected colour key — used only to tint the glyph tiles so
   * the preview matches the live colour selection. Does not affect the icon key.
   */
  color?: string | null;
  testId?: string;
}

function IconPickerInner({ value, onChange, color, testId }: IconPickerProps) {
  const tint = colorHexFor(color);
  return (
    <div
      className={styles.grid}
      role="radiogroup"
      aria-label="Выбор иконки категории"
      data-testid={testId ?? 'icon-picker'}
    >
      {ICON_SET.map((opt) => {
        const { key, label, Icon } = opt;
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
              style={{ background: tint }}
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

export interface ColorPickerProps {
  /** Currently selected colour key (null/undefined → none selected). */
  value?: string | null;
  /** Tap callback — receives the chosen colour key. */
  onChange: (key: string) => void;
  testId?: string;
}

function ColorPickerInner({ value, onChange, testId }: ColorPickerProps) {
  return (
    <div
      className={styles.colorRow}
      role="radiogroup"
      aria-label="Выбор цвета категории"
      data-testid={testId ?? 'color-picker'}
    >
      {COLOR_SET.map((opt) => {
        const { key, label, color } = opt;
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            className={`${styles.swatch} ${
              selected ? styles.swatchSelected : ''
            }`}
            style={{ background: color }}
            onClick={() => onChange(key)}
            data-testid={`color-picker-${key}`}
          />
        );
      })}
    </div>
  );
}

export const ColorPicker = memo(ColorPickerInner);
