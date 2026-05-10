import { useEffect, useRef, useState, createElement } from 'react';
import type { ReactElement } from 'react';

/** rAF count-up to target with cubicOut easing.
 * Source: prototype/poster-screens.jsx L161-181 (verbatim logic).
 * @param target final integer value
 * @param dur ms (default 900)
 */
export function useCountUp(target: number, dur = 900): number {
  const [v, setV] = useState(0);
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    let raf: number | null = null;
    let start: number | null = null;
    const step = (ts: number) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // cubicOut per DESIGN-SYSTEM §7.1
      setV(Math.round(targetRef.current * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [target, dur]);
  return v;
}

/** Format integer with U+202F (thin space) thousands separator. */
export function fmtThousands(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Convenience component wrapping useCountUp for declarative usage. */
export interface CountUpProps {
  value: number;
  dur?: number;
  format?: (n: number) => string;
}

export function CountUp({
  value,
  dur = 900,
  format = fmtThousands,
}: CountUpProps): ReactElement {
  const v = useCountUp(value, dur);
  return createElement('span', null, format(v));
}
