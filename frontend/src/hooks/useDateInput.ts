import { useState } from 'react';

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function displayToIso(display: string): string | null {
  const match = display.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(+y, +m - 1, +d);
  if (isNaN(date.getTime()) || date.getMonth() !== +m - 1) return null;
  return `${y}-${m}-${d}`;
}

export function useDateInput(initialIso: string) {
  const [iso, setIso] = useState(initialIso);
  const [display, setDisplay] = useState(() => initialIso ? isoToDisplay(initialIso) : '');

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let masked = digits;
    if (digits.length > 4) masked = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
    else if (digits.length > 2) masked = `${digits.slice(0, 2)}.${digits.slice(2)}`;
    setDisplay(masked);
    const parsed = displayToIso(masked);
    if (parsed) setIso(parsed);
  };

  return { iso, display, handleChange };
}
