// Phase 25-02: PosterSheet (web) — symmetric to iOS PosterSheet (FeaturesV10/Common).
//
// Web modal primitive used by AddSheet, transaction edit, confirmation
// dialogs, account picker, etc.
//
// Behaviour (per CONTEXT.md §decisions Area 3 + plan must_haves):
//  - When isOpen=false → returns null (no portal, no DOM nodes)
//  - Portal-rendered into document.body so backdrop covers entire viewport
//  - Backdrop opacity 0.45; click on backdrop calls onClose
//  - Escape key while open calls onClose
//  - Body scroll lock while open (`document.body.style.overflow = 'hidden'`)
//    — restored on close OR unmount (T-25-02-03 acceptance: no leak)
//  - Drag-to-close on the .handle: pointer-down + drag down; close if
//    translation > 100px OR velocity > 800px/s; else snap back to 0.
//
// Drag-to-close is implemented with native pointer events (no library); the
// drag is bound to the handle element only, so body content can scroll
// naturally inside the sheet.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './PosterSheet.module.css';

export interface PosterSheetProps {
  /** Whether the sheet is mounted and visible. False → returns null. */
  isOpen: boolean;
  /** Called when the user dismisses (backdrop tap, Escape, drag-to-close). */
  onClose: () => void;
  /** Sheet body — typically a screen-level component (AddSheet, EditTxn, ...). */
  children: ReactNode;
  /**
   * Optional inline override for sheet background — AddSheet uses
   * `'#0E0E0E'` (POSTER.black) per ADD-V10 spec.
   */
  backgroundColor?: string;
  /** Test hook for Playwright (defaults to "poster-sheet"). */
  testId?: string;
}

const DRAG_CLOSE_TRANSLATION_PX = 100;
const DRAG_CLOSE_VELOCITY_PX_PER_S = 800;

export function PosterSheet({
  isOpen,
  onClose,
  children,
  backgroundColor,
  testId = 'poster-sheet',
}: PosterSheetProps) {
  const [dragOffset, setDragOffset] = useState(0);
  // WR-25-03 (review fix): track active-drag vs settling so we can apply
  // a CSS transition on release (smooth snap-back) without animating the
  // user's finger movement during the drag itself.
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; t: number } | null>(null);

  // Latest onClose ref so the Escape effect doesn't re-bind on every prop change.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Body scroll lock + Escape handler while open.
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  // Reset drag offset when sheet closes/opens.
  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = { y: e.clientY, t: performance.now() };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dy = e.clientY - dragStartRef.current.y;
    setDragOffset(Math.max(0, dy)); // downward drag only
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStartRef.current) return;
      const start = dragStartRef.current;
      const dy = Math.max(0, e.clientY - start.y);
      const dtSeconds = Math.max(0.001, (performance.now() - start.t) / 1000);
      const velocityY = dy / dtSeconds; // px / s, positive = downward
      dragStartRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // releasePointerCapture can throw if pointer was already released; safe ignore.
      }
      // WR-25-03 (review fix): release the active-drag flag BEFORE deciding
      // close vs snap-back. With `isDragging=false`, the inline-style transform
      // change to 0 animates via CSS transition (smooth snap-back) instead of
      // jumping in one frame. On the close branch React unmounts before
      // transition runs anyway, so it costs nothing.
      setIsDragging(false);
      if (
        dy > DRAG_CLOSE_TRANSLATION_PX ||
        velocityY > DRAG_CLOSE_VELOCITY_PX_PER_S
      ) {
        onCloseRef.current();
      } else {
        setDragOffset(0);
      }
    },
    []
  );

  if (!isOpen) return null;

  const sheetStyle: CSSProperties = {
    transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
    // WR-25-03 (review fix): only animate transform when settling AFTER a
    // drag, not during it. Animating during the drag would lag behind the
    // user's finger and feel unresponsive.
    transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)',
    background: backgroundColor,
  };

  // SSR safety — only portal once `document` is available (Vite dev + tests
  // always have it; check guards future SSR migrations).
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close sheet"
        className={styles.backdrop}
        data-testid={testId}
        onClick={() => onCloseRef.current()}
      />
      <div
        className={styles.sheet}
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
      >
        <div
          className={styles.handleWrap}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          data-testid={`${testId}-handle`}
        >
          <div className={styles.handle} />
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>,
    document.body
  );
}
