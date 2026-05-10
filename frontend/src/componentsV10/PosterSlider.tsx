import { useEffect, useRef, useState } from 'react';
import styles from './PosterSlider.module.css';

export interface PosterSliderProps {
  value: number;
  min?: number; // default 0
  max: number;
  step?: number; // default 500
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label?: string;
}

export function PosterSlider({
  value,
  min = 0,
  max,
  step = 500,
  onChange,
  onCommit,
  label,
}: PosterSliderProps) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const handleSlide = (next: number) => {
    const clamped = clamp(next);
    setLocal(clamped);
    onChange(clamped);
    if (onCommit) {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => onCommit(clamped), 300);
    }
  };

  return (
    <div className={styles.wrapper}>
      {label && <div className={styles.label}>{label}</div>}
      <div className={styles.row}>
        <input
          type="range"
          className={styles.range}
          min={min}
          max={max}
          step={step}
          value={local}
          onChange={(e) =>
            handleSlide(Math.round(+e.target.value / step) * step)
          }
        />
        {editing ? (
          <input
            type="number"
            className={styles.numInput}
            value={local}
            autoFocus
            min={min}
            max={max}
            onChange={(e) => handleSlide(+e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setEditing(false);
            }}
          />
        ) : (
          <span
            className={styles.num}
            role="button"
            tabIndex={0}
            onClick={() => setEditing(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setEditing(true);
            }}
          >
            {local.toLocaleString('ru-RU').replace(/\s/g, ' ')}
          </span>
        )}
      </div>
    </div>
  );
}
