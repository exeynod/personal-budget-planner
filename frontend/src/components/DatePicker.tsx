import { useEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, CaretLeft, CaretRight } from '@phosphor-icons/react';
import styles from './DatePicker.module.css';

export interface DatePickerProps {
  /** ISO `YYYY-MM-DD` или пустая строка / null — если не выбрано. */
  value: string | null;
  onChange: (iso: string | null) => void;
  /** Подсказка в trigger при пустом value. */
  placeholder?: string;
  /** Можно ли очистить дату (для опциональных полей). */
  clearable?: boolean;
  disabled?: boolean;
  /** Максимальная разрешённая дата (включительно). */
  max?: string;
  /** Минимальная разрешённая дата (включительно). */
  min?: string;
}

const WEEK_DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoOf(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

function parseIso(iso: string | null): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return { y: +y, m: +mo - 1, d: +d };
}

function todayMoscowParts(): { y: number; m: number; d: number } {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return { y: now.getUTCFullYear(), m: now.getUTCMonth(), d: now.getUTCDate() };
}

function formatDisplay(iso: string | null): string {
  const p = parseIso(iso);
  if (!p) return '';
  return `${pad2(p.d)}.${pad2(p.m + 1)}.${p.y}`;
}

/**
 * Inline glass-стиль DatePicker. Триггер раскрывает календарь вниз внутри
 * формы — без portal/overlay, чтобы корректно работать в BottomSheet.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'ДД.ММ.ГГГГ',
  clearable = false,
  disabled = false,
  max,
  min,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const parsed = parseIso(value) ?? todayMoscowParts();
    return { y: parsed.y, m: parsed.m };
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  // Когда открываем календарь — синхронизируем view с текущим value, чтобы
  // календарь показывал месяц выбранной даты, а не последний навигированный.
  useEffect(() => {
    if (open) {
      const parsed = parseIso(value) ?? todayMoscowParts();
      setView({ y: parsed.y, m: parsed.m });
    }
  }, [open, value]);

  // Закрываем при клике снаружи.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const today = todayMoscowParts();
  const selected = parseIso(value);

  // Сетка 6×7 = 42 ячейки. Старт — понедельник.
  const cells = useMemo(() => {
    const firstOfMonth = new Date(view.y, view.m, 1);
    // JS getDay: 0=Sun .. 6=Sat. Convert to Monday-first: 0=Mon .. 6=Sun.
    const offset = (firstOfMonth.getDay() + 6) % 7;
    const start = new Date(view.y, view.m, 1 - offset);
    const out: { y: number; m: number; d: number; outside: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + i);
      out.push({
        y: dt.getFullYear(),
        m: dt.getMonth(),
        d: dt.getDate(),
        outside: dt.getMonth() !== view.m,
      });
    }
    return out;
  }, [view]);

  const isDisabled = (iso: string): boolean => {
    if (max && iso > max) return true;
    if (min && iso < min) return true;
    return false;
  };

  const navMonth = (delta: number) => {
    setView((v) => {
      let m = v.m + delta;
      let y = v.y;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      return { y, m };
    });
  };

  const handlePick = (cell: { y: number; m: number; d: number }) => {
    const iso = isoOf(cell.y, cell.m, cell.d);
    if (isDisabled(iso)) return;
    onChange(iso);
    setOpen(false);
  };

  const handleToday = () => {
    const iso = isoOf(today.y, today.m, today.d);
    if (isDisabled(iso)) return;
    onChange(iso);
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setOpen(false);
  };

  const display = formatDisplay(value);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''} ${!display ? styles.triggerEmpty : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span>{display || placeholder}</span>
        <span className={`${styles.chev} ${open ? styles.chevOpen : ''}`}>
          <CaretDown size={14} weight="bold" />
        </span>
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Выбор даты">
          <div className={styles.head}>
            <button
              type="button"
              className={styles.headBtn}
              onClick={() => navMonth(-1)}
              aria-label="Предыдущий месяц"
            >
              <CaretLeft size={14} weight="bold" />
            </button>
            <div className={styles.headLabel}>
              {MONTHS_RU[view.m]} {view.y}
            </div>
            <button
              type="button"
              className={styles.headBtn}
              onClick={() => navMonth(1)}
              aria-label="Следующий месяц"
            >
              <CaretRight size={14} weight="bold" />
            </button>
          </div>

          <div className={styles.weekDays}>
            {WEEK_DAYS_RU.map((wd) => (
              <div key={wd} className={styles.weekDay}>{wd}</div>
            ))}
          </div>

          <div className={styles.grid}>
            {cells.map((c, i) => {
              const iso = isoOf(c.y, c.m, c.d);
              const isToday =
                c.y === today.y && c.m === today.m && c.d === today.d;
              const isSelected =
                selected !== null &&
                c.y === selected.y && c.m === selected.m && c.d === selected.d;
              const dis = isDisabled(iso);
              return (
                <button
                  key={i}
                  type="button"
                  className={[
                    styles.day,
                    c.outside ? styles.dayOutside : '',
                    isToday ? styles.dayToday : '',
                    isSelected ? styles.daySelected : '',
                    dis ? styles.dayDisabled : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handlePick(c)}
                  disabled={dis}
                  aria-label={`${c.d} ${MONTHS_RU[c.m]} ${c.y}`}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected || undefined}
                >
                  {c.d}
                </button>
              );
            })}
          </div>

          <div className={styles.foot}>
            <button type="button" className={styles.footBtn} onClick={handleToday}>
              Сегодня
            </button>
            {clearable && (
              <button
                type="button"
                className={`${styles.footBtn} ${styles.footBtnAccent}`}
                onClick={handleClear}
              >
                Сбросить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
