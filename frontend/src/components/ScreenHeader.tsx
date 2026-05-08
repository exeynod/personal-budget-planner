import { CaretLeft } from '@phosphor-icons/react';
import styles from './ScreenHeader.module.css';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
  /** Тон под фон экрана: 'light' для Aurora, 'dark' для Mesh/Sunset. По умолчанию 'light'. */
  tint?: 'light' | 'dark';
}

export function ScreenHeader({ title, subtitle, onBack, rightAction, tint = 'light' }: ScreenHeaderProps) {
  return (
    <header className={`${styles.header} ${tint === 'dark' ? styles.dark : ''}`}>
      <button
        type="button"
        onClick={onBack}
        className={styles.back}
        aria-label="Назад"
      >
        <CaretLeft size={18} weight="bold" />
      </button>
      <div className={styles.center}>
        <div className={styles.title}>{title}</div>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
      </div>
      <div className={styles.right}>
        {rightAction ?? null}
      </div>
    </header>
  );
}
