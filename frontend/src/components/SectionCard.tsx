import type { ReactNode } from 'react';
import styles from './SectionCard.module.css';

export interface SectionCardProps {
  number: number | string;
  title: string;
  done?: boolean;
  locked?: boolean;
  children?: ReactNode;
}

export function SectionCard({ number, title, done, locked, children }: SectionCardProps) {
  const cls = [styles.section, locked ? styles.locked : '', done ? styles.done : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <div className={styles.head}>
        <span className={`${styles.num} ${done ? styles.numDone : ''}`}>
          {done ? '✓' : number}
        </span>
        <h4 className={styles.title}>{title}</h4>
        {done && <span className={styles.checkMark}>✓</span>}
      </div>
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
