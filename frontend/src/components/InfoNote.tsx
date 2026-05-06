import type { ReactNode } from 'react';
import { Info } from '@phosphor-icons/react';
import styles from './InfoNote.module.css';

interface InfoNoteProps {
  children: ReactNode;
  label?: string;
}

export function InfoNote({ children, label = 'Как считается' }: InfoNoteProps) {
  return (
    <details className={styles.note}>
      <summary className={styles.summary} aria-label={label}>
        <Info size={14} weight="regular" />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}
