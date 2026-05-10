// Phase 25-10: 3×4 numeric keypad used by the AddSheet (custom replacement
// for the system keyboard — ADD-V10-02 / T-A-03).
//
// Layout (rows × columns):
//   1 2 3
//   4 5 6
//   7 8 9
//   . 0 ⌫
//
// All press handling is button-level (single-tap onClick). The keypad
// emits one of three semantic events:
//   - onAppendDigit('0'..'9')  — digit press
//   - onAppendDot()            — decimal-point press
//   - onBackspace()            — erase last character
//
// The parent (AddSheet) is responsible for routing those events into the
// `appendDigit / appendDot / backspace` reducers from `computeAddSheet.ts`.

import styles from './Keypad.module.css';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export interface KeypadProps {
  onAppendDigit: (digit: string) => void;
  onAppendDot: () => void;
  onBackspace: () => void;
}

export function Keypad({
  onAppendDigit,
  onAppendDot,
  onBackspace,
}: KeypadProps) {
  return (
    <div
      className={styles.grid}
      role="group"
      aria-label="Цифровая клавиатура"
      data-testid="add-sheet-keypad"
    >
      {DIGITS.map((d) => (
        <button
          key={d}
          type="button"
          className={styles.key}
          onClick={() => onAppendDigit(d)}
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        className={styles.key}
        onClick={onAppendDot}
        aria-label="."
      >
        .
      </button>
      <button
        type="button"
        className={styles.key}
        onClick={() => onAppendDigit('0')}
      >
        0
      </button>
      <button
        type="button"
        className={`${styles.key} ${styles.keyBackspace}`}
        onClick={onBackspace}
        aria-label="Удалить последнюю цифру"
      >
        {'⌫'}
      </button>
    </div>
  );
}
