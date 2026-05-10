import type { ReactNode } from 'react';
import styles from './Chip.module.css';

export interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export function Chip({
  active = false,
  onClick,
  children,
  className,
}: ChipProps) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      className={`${styles.chip}${active ? ' ' + styles.active : ''}${
        className ? ' ' + className : ''
      }`}
    >
      {children}
    </span>
  );
}
