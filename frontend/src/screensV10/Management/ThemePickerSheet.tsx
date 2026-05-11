// Phase 54-01 (LG-SW-01, LG-SW-02, LG-SW-05 web): ThemePickerSheet — Settings →
// row «Тема» bottom-sheet picker.
//
// Wraps the shared PosterSheet primitive with a vertical list of 3 options
// (Maximal Poster / Liquid Glass / iOS Default). Each row renders a colour
// swatch + label + description + ✓ marker на текущем.
//
// Tap on row → calls `onSelect(theme)` (which triggers useTheme setter →
// localStorage + CustomEvent broadcast → instant re-render across SPA) AND
// `onClose()`. Tap on backdrop closes без изменения значения.
//
// User-request 2026-05-11.

import { PosterSheet } from '../common';
import {
  THEMES,
  themeLabel,
  themeDescription,
  type Theme,
} from '../common';
import styles from './ThemePickerSheet.module.css';

export interface ThemePickerSheetProps {
  isOpen: boolean;
  current: Theme;
  onSelect: (t: Theme) => void;
  onClose: () => void;
}

const PREVIEW_HEX: Record<Theme, string> = {
  maximal_poster: '#FF5A3C',
  liquid_glass: '#F2F2F7',
  ios_default: '#E5E5EA',
};

export function ThemePickerSheet({
  isOpen,
  current,
  onSelect,
  onClose,
}: ThemePickerSheetProps) {
  return (
    <PosterSheet
      isOpen={isOpen}
      onClose={onClose}
      testId="theme-sheet"
      backgroundColor="var(--poster-paper)"
    >
      <div className={styles.sheetBody}>
        <div className={styles.title}>ТЕМА</div>
        <div
          className={styles.list}
          role="radiogroup"
          aria-label="Выбор темы"
        >
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={t === current}
              className={
                t === current
                  ? `${styles.row} ${styles.rowActive}`
                  : styles.row
              }
              onClick={() => {
                onSelect(t);
                onClose();
              }}
              data-testid={`theme-${t}`}
            >
              <span
                className={styles.swatch}
                style={{ background: PREVIEW_HEX[t] }}
                aria-hidden
              />
              <span className={styles.text}>
                <span className={styles.label}>{themeLabel(t)}</span>
                <span className={styles.description}>
                  {themeDescription(t)}
                </span>
              </span>
              {t === current && (
                <span className={styles.check} aria-hidden>
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </PosterSheet>
  );
}
