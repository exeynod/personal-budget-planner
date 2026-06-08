import type { KeyboardEvent } from 'react';

/**
 * Returns an onKeyDown handler that dismisses the on-screen keyboard on Enter
 * by blurring the field (Telegram WebView hides the keyboard on blur). Use on
 * single-line text/number inputs across the app so Enter reliably closes the
 * keyboard. Pass an optional `onEnter` callback to also commit (e.g. save) —
 * it runs before blur. Does nothing for Shift+Enter (lets multiline textareas
 * keep newline behaviour if they opt out by not using this handler).
 */
export function useEnterToDismiss(
  onEnter?: () => void,
): (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void {
  return (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnter?.();
      e.currentTarget.blur();
    }
  };
}
