import { useState } from 'react';
import styles from './FAB.module.css';

export interface FABProps {
  onClick: () => void;
  ariaLabel?: string;
}

export function FAB({ onClick, ariaLabel = 'Добавить транзакцию' }: FABProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={styles.fab}
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        transform: pressed
          ? 'scale(0.88) rotate(-90deg)'
          : 'scale(1) rotate(0)',
      }}
    >
      +
    </button>
  );
}
