import { Plus } from '@phosphor-icons/react';
import styles from './Fab.module.css';

export interface FabProps { onClick: () => void; ariaLabel: string; }

export function Fab({ onClick, ariaLabel }: FabProps) {
  return (
    <button type="button" onClick={onClick} className={styles.fab} aria-label={ariaLabel}>
      <Plus size={28} weight="bold" />
    </button>
  );
}
