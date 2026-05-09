import { useState, type ReactNode } from 'react';
import { Info } from '@phosphor-icons/react';
import styles from './InfoNote.module.css';

interface InfoNoteProps {
  children: ReactNode;
  label?: string;
}

/**
 * Info accordion для секций Analytics. Триггер inline-22px-кнопка с ⓘ.
 * По клику тело раскрывается ВНИЗ как новая строка — `display: contents`
 * на корне делает `body` прямым flex-child'ом родителя, а
 * `flex-basis: 100%` форсит wrap на новую строку (требуется
 * `flex-wrap: wrap` у самого родителя — у нас на `.heroTop` и
 * `.sectionTitle`).
 *
 * Никакого absolute/popover — он наезжал на цифру в hero card. Inline
 * accordion толкает chartWrap / следующий блок вниз и не налезает.
 */
export function InfoNote({ children, label = 'Как считается' }: InfoNoteProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className={styles.note}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Info size={14} weight="regular" />
      </button>
      {open && <div className={styles.body}>{children}</div>}
    </span>
  );
}
