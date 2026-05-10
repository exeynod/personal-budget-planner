import type { CSSProperties, ReactNode } from 'react';
import { useCountUp, fmtThousands } from '../hooks/useCountUp';
import styles from './BigFig.module.css';

export interface BigFigProps {
  value: number;
  sup?: ReactNode; // suffix e.g. "₽"
  size?: number; // default 90
  dur?: number; // default 900ms
  animate?: boolean; // default true; false → render value directly
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export function BigFig({
  value,
  sup,
  size = 90,
  dur = 900,
  animate = true,
  color,
  className,
  style,
}: BigFigProps) {
  const v = useCountUp(animate ? value : 0, dur);
  const display = animate ? v : value;
  return (
    <div
      className={`${styles.bigFig}${className ? ' ' + className : ''}`}
      style={{ fontSize: size, color, ...style }}
    >
      {fmtThousands(display)}
      {sup != null && (
        <sup className={styles.sup} style={{ fontSize: size * 0.36 }}>
          {sup}
        </sup>
      )}
    </div>
  );
}
