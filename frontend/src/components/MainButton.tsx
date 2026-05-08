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

  // Browser fallback (dev mode): sticky button at the bottom of the page.
  // Liquid-Glass accent gradient CTA с heavy glow-shadow.
  return (
    <div style={{ padding: '16px 0 8px' }}>
      <button
        type="button"
        onClick={enabled ? onClick : undefined}
        disabled={!enabled}
        style={{
          display: 'block',
          width: '100%',
          padding: '16px 0',
          background: 'linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 80%, #000 0%))',
          color: '#fff',
          border: 0,
          borderRadius: 22,
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          cursor: enabled ? 'pointer' : 'not-allowed',
          opacity: enabled ? 1 : 0.4,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 12px 32px color-mix(in srgb, var(--accent) 40%, transparent)',
          fontFamily: 'inherit',
        }}
      >
        {text}
      </button>
    </div>
  );
}
