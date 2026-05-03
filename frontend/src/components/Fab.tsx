import styles from './Fab.module.css';

export interface FabProps { onClick: () => void; ariaLabel: string; label?: string; }

export function Fab({ onClick, ariaLabel, label = '+' }: FabProps) {
  return <button type="button" onClick={onClick} className={styles.fab} aria-label={ariaLabel}>{label}</button>;
}
