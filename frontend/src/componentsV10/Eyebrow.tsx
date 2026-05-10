import type { CSSProperties, ReactNode } from 'react';
import styles from './Eyebrow.module.css';

export interface EyebrowProps {
  children: ReactNode;
  opacity?: number; // default 0.7
  color?: string; // CSS color or token var
  className?: string;
  style?: CSSProperties;
}

export function Eyebrow({
  children,
  opacity = 0.7,
  color,
  className,
  style,
}: EyebrowProps) {
  return (
    <div
      className={`${styles.eyebrow}${className ? ' ' + className : ''}`}
      style={{ opacity, color, ...style }}
    >
      {children}
    </div>
  );
}
