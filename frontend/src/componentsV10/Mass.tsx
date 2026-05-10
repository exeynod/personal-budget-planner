import type { CSSProperties, ReactNode } from 'react';
import styles from './Mass.module.css';

export interface MassProps {
  children: ReactNode;
  italic?: boolean; // false → Archivo Black uppercase; true → DM Serif italic
  size?: number; // px, default 88
  className?: string;
  style?: CSSProperties;
}

export function Mass({
  children,
  italic = false,
  size = 88,
  className,
  style,
}: MassProps) {
  return (
    <div
      className={`${italic ? styles.massItalic : styles.massBold}${
        className ? ' ' + className : ''
      }`}
      style={{ fontSize: size, ...style }}
    >
      {children}
    </div>
  );
}
