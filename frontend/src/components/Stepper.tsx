import styles from './Stepper.module.css';

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  wrap?: boolean;
}

export function Stepper({ value, min, max, onChange, wrap }: StepperProps) {
  const dec = () => {
    const next = value - 1;
    if (next < min) onChange(wrap ? max : min);
    else onChange(next);
  };
  const inc = () => {
    const next = value + 1;
    if (next > max) onChange(wrap ? min : max);
    else onChange(next);
  };
  return (
    <div className={styles.stepper}>
      <button type="button" onClick={dec} aria-label="Уменьшить">
        −
      </button>
      <span className={styles.val}>{value}</span>
      <button type="button" onClick={inc} aria-label="Увеличить">
        +
      </button>
    </div>
  );
}
