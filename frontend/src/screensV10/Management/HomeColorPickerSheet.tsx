// Phase 30-07 (DEBT-08): HomeColorPickerSheet — Settings → row «Цвет Home»
// bottom-sheet picker.
//
// Wraps the shared PosterSheet primitive with a 2×2 grid of 4 swatches
// (coral / cobalt / black / cream). The currently selected swatch gets a
// 2px paper border + an outer coral ring so it's visible against any of the
// four sheet-body colors.
//
// Tap on swatch → calls `onSelect(color)` (writes localStorage via
// useHomeColor setter) AND `onClose()`. Tapping the backdrop closes without
// changing the value (standard PosterSheet behaviour).
//
// User-request 2026-05-11.

import { PosterSheet } from '../common';
import {
  HOME_COLORS,
  homeColorLabel,
  homeColorCssValue,
  type HomeColor,
} from '../Home/useHomeColor';
import styles from './HomeColorPickerSheet.module.css';

export interface HomeColorPickerSheetProps {
  isOpen: boolean;
  current: HomeColor;
  onSelect: (c: HomeColor) => void;
  onClose: () => void;
}

export function HomeColorPickerSheet({
  isOpen,
  current,
  onSelect,
  onClose,
}: HomeColorPickerSheetProps) {
  return (
    <PosterSheet
      isOpen={isOpen}
      onClose={onClose}
      testId="home-color-sheet"
      backgroundColor="var(--poster-paper)"
    >
      <div className={styles.sheetBody}>
        <div className={styles.title}>ЦВЕТ HOME</div>
        <div
          className={styles.grid}
          role="radiogroup"
          aria-label="Выбор цвета Home-экрана"
        >
          {HOME_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === current}
              className={
                c === current
                  ? `${styles.swatch} ${styles.swatchActive}`
                  : styles.swatch
              }
              style={{ background: homeColorCssValue(c) }}
              onClick={() => {
                onSelect(c);
                onClose();
              }}
              data-testid={`home-color-${c}`}
            >
              <span className={styles.swatchLabel}>{homeColorLabel(c)}</span>
            </button>
          ))}
        </div>
      </div>
    </PosterSheet>
  );
}
