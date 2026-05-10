import type { CSSProperties, ReactNode } from 'react';
import styles from './Plate.module.css';

export type PlateTone = 'inverted' | 'yellow' | 'red' | 'paper' | 'dark';

export interface PlateProps {
  children: ReactNode;
  tone?: PlateTone; // default 'inverted'
  className?: string;
  style?: CSSProperties;
}

export function Plate({
  children,
  tone = 'inverted',
  className,
  style,
}: PlateProps) {
  return (
    <div
      className={`${styles.plate} ${styles['tone-' + tone]}${
        className ? ' ' + className : ''
      }`}
      style={style}
    >
      {children}
    </div>
  );
}
