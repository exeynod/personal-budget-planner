// Liquid Glass v2 — native iOS UI primitives shared across native screens.
//
// Faithful to the iOS MainShell reference (.planning/ios-native-screens):
//   - large-title screen header + circular trailing action
//   - inset-grouped card list with hairline separators
//   - segmented control (Расходы/Доходы, История/План)
//   - native bottom tab bar (Главная/Транзакции/AI/Управление)
//
// Icons reuse @phosphor-icons/react (already a project dependency) as the web
// stand-in for SF Symbols.

import { useCallback, useEffect, useRef, type FocusEvent, type ReactNode } from 'react';
import {
  House,
  ListBullets,
  Sparkle,
  GearSix,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react';
import styles from './NativePrimitives.module.css';

// ─────────────────── Large title header ───────────────────

export function NativeLargeTitle({
  title,
  trailing,
}: {
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={styles.largeHeader}>
      <h1 className={styles.largeTitle}>{title}</h1>
      {trailing != null && (
        <div className={styles.headerTrailing}>{trailing}</div>
      )}
    </div>
  );
}

// ─────────────────── Nav bar (pushed screens) ───────────────────

export function NativeNavBar({
  title,
  onBack,
  trailing,
}: {
  title: string;
  onBack?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div className={styles.navBar}>
      {onBack && (
        <button type="button" className={styles.navBack} onClick={onBack}>
          <CaretLeft size={20} weight="bold" />
          Назад
        </button>
      )}
      <span className={styles.navTitle}>{title}</span>
      {trailing != null && <div className={styles.navTrailing}>{trailing}</div>}
    </div>
  );
}

// ─────────────────── Section header ───────────────────

export function SectionHeader({
  children,
  trailing,
}: {
  children: ReactNode;
  /** Optional trailing action (e.g. «+ Добавить») aligned to the right edge. */
  trailing?: ReactNode;
}) {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionHeaderTitle}>{children}</span>
      {trailing != null && (
        <span className={styles.sectionHeaderTrailing}>{trailing}</span>
      )}
    </div>
  );
}

/** Accent text action for a SectionHeader's `trailing` slot (e.g. «+ Добавить»). */
export function SectionHeaderAction({
  children,
  onClick,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={styles.sectionHeaderAction}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

// ─────────────────── Inset group + row ───────────────────

export function InsetGroup({ children }: { children: ReactNode }) {
  return <div className={styles.insetGroup}>{children}</div>;
}

export function InsetRow({
  leading,
  title,
  subtitle,
  trailing,
  trailingMuted,
  chevron,
  onClick,
  testId,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  trailingMuted?: boolean;
  chevron?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  const interactive = typeof onClick === 'function';
  const rowClass = [
    styles.insetRow,
    leading == null ? styles.insetRowNoIcon : '',
    interactive ? '' : styles.insetRowStatic,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={rowClass}
      onClick={onClick}
      disabled={!interactive}
      data-testid={testId}
    >
      {leading}
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{title}</span>
        {subtitle != null && (
          <span className={styles.rowSubtitle}>{subtitle}</span>
        )}
      </span>
      {(trailing != null || chevron) && (
        <span
          className={`${styles.rowTrailing} ${
            trailingMuted ? styles.rowTrailingMuted : ''
          }`}
        >
          {trailing}
          {chevron && (
            <span className={styles.rowChevron}>
              <CaretRight size={16} weight="bold" />
            </span>
          )}
        </span>
      )}
    </button>
  );
}

// ─────────────────── Keyboard-aware focus scroll (iPhone) ───────────────────

/**
 * ADR-0008 (bug fix B) — on iPhone the on-screen keyboard covers a focused
 * free-text input (and the info below it) because the WebView doesn't scroll the
 * field into view. This hook returns props to spread onto an `<input>` /
 * `<textarea>` (or any focusable field): on focus it scrolls the element into
 * the centre of the (now keyboard-shrunken) visible area, after a short delay so
 * the keyboard has finished animating in. It ALSO listens to
 * `window.visualViewport` resize while the field is focused, so a late keyboard
 * open (or rotation) re-centres the field.
 *
 * Composes with {@link useEnterToDismiss}: pass an existing `onKeyDown` straight
 * through — this hook only owns `onFocus`/`onBlur`, never `onKeyDown`.
 *
 * Usage:
 *   const focusScroll = useScrollIntoViewOnFocus();
 *   <input {...focusScroll} onKeyDown={onEnter} />
 */
export function useScrollIntoViewOnFocus(): {
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
} {
  const elRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollIntoCenter = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {
      // Older WebViews without smooth-scroll options — best effort.
      el.scrollIntoView();
    }
  }, []);

  const onFocus = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      elRef.current = e.currentTarget;
      // Delay so the keyboard has animated in and visualViewport has shrunk
      // before we measure/scroll (~300ms is the iOS keyboard slide duration).
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(scrollIntoCenter, 300);
      // Keep the field visible if the viewport resizes later (keyboard open /
      // rotation). Removed on blur.
      const vv =
        typeof window !== 'undefined' ? window.visualViewport : undefined;
      vv?.addEventListener('resize', scrollIntoCenter);
    },
    [scrollIntoCenter],
  );

  const onBlur = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const vv =
      typeof window !== 'undefined' ? window.visualViewport : undefined;
    vv?.removeEventListener('resize', scrollIntoCenter);
    elRef.current = null;
  }, [scrollIntoCenter]);

  // Safety net: clean up the viewport listener + timer on unmount (e.g. the
  // input is removed while still focused, so onBlur never fires).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const vv =
        typeof window !== 'undefined' ? window.visualViewport : undefined;
      vv?.removeEventListener('resize', scrollIntoCenter);
    };
  }, [scrollIntoCenter]);

  return { onFocus, onBlur };
}

// ─────────────────── Segmented control ───────────────────

export interface SegOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<SegOption<T>>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className={styles.segmented} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`${styles.segItem} ${
            o.value === value ? styles.segItemActive : ''
          }`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────── Circle icon button ───────────────────

export function CircleButton({
  children,
  onClick,
  ariaLabel,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={styles.circleBtn}
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

// ─────────────────── Tab bar ───────────────────

export type NativeTabId = 'home' | 'transactions' | 'ai' | 'management';

const TABS: ReadonlyArray<{
  id: NativeTabId;
  label: string;
  Icon: typeof House;
}> = [
  { id: 'home', label: 'Главная', Icon: House },
  { id: 'transactions', label: 'Транзакции', Icon: ListBullets },
  { id: 'ai', label: 'AI', Icon: Sparkle },
  { id: 'management', label: 'Управление', Icon: GearSix },
];

export function NativeTabBar({
  active,
  onTab,
}: {
  active: NativeTabId;
  onTab: (id: NativeTabId) => void;
}) {
  return (
    <nav className={styles.tabBar}>
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={label}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            onClick={() => onTab(id)}
          >
            <Icon size={24} weight={isActive ? 'fill' : 'regular'} />
            <span className={styles.tabLabel}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
