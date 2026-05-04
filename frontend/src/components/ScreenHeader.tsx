import { ArrowLeft } from '@phosphor-icons/react';
import styles from './ScreenHeader.module.css';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, onBack, rightAction }: ScreenHeaderProps) {
  return (
    <header className={styles.header}>
      <button type="button" onClick={onBack} className={styles.back} aria-label="Назад">
        <ArrowLeft size={22} weight="thin" />
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
