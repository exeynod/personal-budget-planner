import { useEffect } from 'react';

export interface MainButtonProps {
  text: string;
  enabled: boolean;
  onClick: () => void;
}

/**
 * Telegram MainButton wrapper with browser fallback.
 *
 * In Telegram: drives `window.Telegram.WebApp.MainButton` directly (most
 * portable across SDK versions — works without depending on @telegram-apps/sdk
 * mainButton scope being mounted).
 *
 * In browser dev: renders an inline button fixed to the bottom of the viewport.
 */
export function MainButton({ text, enabled, onClick }: MainButtonProps) {
  const wa = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
  const tgMainButton = wa?.MainButton;

  useEffect(() => {
    if (!tgMainButton) return;
    tgMainButton.setText(text);
    tgMainButton.show();
    if (enabled) tgMainButton.enable();
    else tgMainButton.disable();
    tgMainButton.onClick(onClick);
    return () => {
      tgMainButton.offClick(onClick);
      tgMainButton.hide();
    };
  }, [tgMainButton, text, enabled, onClick]);

  if (tgMainButton) {
    // Telegram renders the button — nothing to render in DOM.
    return null;
  }

  // Browser fallback (dev mode, opening Mini App URL directly in a browser).
  return (
    <button
      type="button"
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 28,
        height: 'var(--main-button-height, 54px)',
        background: 'var(--color-primary)',
        color: '#fff',
        border: 0,
        borderRadius: 'var(--radius-md, 14px)',
        fontSize: 16,
        fontWeight: 600,
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.5,
        boxShadow: '0 6px 18px rgba(78,164,255,0.35)',
      }}
    >
      {text}
    </button>
  );
}
