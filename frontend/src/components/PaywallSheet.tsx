// Phase 35-03 (REQ-35-03): Paywall bottom-sheet for Pro tier upgrade.
//
// Opened when an AI endpoint throws ProTierRequiredError (see api/client.ts).
// Fetches /me/tier on open to render trial-days-left copy if applicable,
// then calls POST /billing/create-payment and redirects to ЮKassa.

import { useState, useEffect } from 'react';
import { createPayment } from '../api/billing';
import { getMyTier, type TierInfo } from '../api/tier';

const PRO_AMOUNT_CENTS = 29900; // 299 ₽
const PRO_ANNUAL_CENTS = 199000; // 1990 ₽

interface Props {
  isOpen: boolean;
  onClose: () => void;
  reason?: string; // что user пытался сделать, что триггернуло paywall
}

export function PaywallSheet({ isOpen, onClose, reason }: Props) {
  const [tier, setTier] = useState<TierInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');

  useEffect(() => {
    if (isOpen) {
      getMyTier()
        .then(setTier)
        .catch(() => {});
    }
  }, [isOpen]);

  async function handlePay() {
    setLoading(true);
    setError(null);
    try {
      const amount = period === 'annual' ? PRO_ANNUAL_CENTS : PRO_AMOUNT_CENTS;
      const description =
        period === 'annual'
          ? 'TG Budget Planner — Pro подписка (год)'
          : 'TG Budget Planner — Pro подписка (месяц)';
      const result = await createPayment({
        amount_cents: amount,
        description,
        return_url: window.location.href,
      });
      window.location.assign(result.confirmation_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать платёж');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const trialDaysLeft =
    tier?.is_trial_active && tier.trial_ends_at
      ? Math.max(
          0,
          Math.ceil(
            (new Date(tier.trial_ends_at).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="paywall-sheet"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--poster-paper, #FFF6E8)',
          color: 'var(--poster-ink, #0E0E0E)',
          padding: '24px 22px 32px',
          width: '100%',
          maxWidth: 420,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--poster-font-jet-brains-mono)',
            fontSize: 11,
            letterSpacing: '0.14em',
            opacity: 0.7,
            marginBottom: 12,
          }}
        >
          PRO TIER
        </div>
        <h2
          style={{
            fontFamily: 'var(--poster-font-dm-serif), serif',
            fontStyle: 'italic',
            fontSize: 36,
            lineHeight: 1.1,
            margin: '0 0 16px',
          }}
        >
          Открыть Pro
        </h2>
        {reason && (
          <p
            data-testid="paywall-reason"
            style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}
          >
            {reason}
          </p>
        )}
        {tier?.is_trial_active && trialDaysLeft > 0 && (
          <p
            data-testid="paywall-trial-notice"
            style={{
              fontSize: 13,
              color: 'var(--poster-coral)',
              marginBottom: 16,
            }}
          >
            ⏱ Триал активен: {trialDaysLeft} дней. Подключи Pro сейчас, чтобы не
            потерять доступ.
          </p>
        )}

        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0 0 20px',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <li>✓ AI-чат с tool-use (запись + анализ из текста)</li>
          <li>✓ Безлимит транзакций</li>
          <li>✓ CSV-экспорт + tax reserve calculator</li>
          <li>✓ Business/Personal теги для самозанятых</li>
        </ul>

        <div
          role="radiogroup"
          aria-label="Период подписки"
          style={{ display: 'flex', gap: 8, marginBottom: 16 }}
        >
          <button
            type="button"
            role="radio"
            aria-checked={period === 'monthly'}
            onClick={() => setPeriod('monthly')}
            data-testid="period-monthly"
            style={{
              flex: 1,
              padding: '12px',
              background:
                period === 'monthly'
                  ? 'var(--poster-ink, #0E0E0E)'
                  : 'transparent',
              color:
                period === 'monthly'
                  ? 'var(--poster-paper, #FFF6E8)'
                  : 'var(--poster-ink, #0E0E0E)',
              border: '1px solid var(--poster-ink, #0E0E0E)',
              cursor: 'pointer',
            }}
          >
            299 ₽ / мес
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={period === 'annual'}
            onClick={() => setPeriod('annual')}
            data-testid="period-annual"
            style={{
              flex: 1,
              padding: '12px',
              background:
                period === 'annual'
                  ? 'var(--poster-ink, #0E0E0E)'
                  : 'transparent',
              color:
                period === 'annual'
                  ? 'var(--poster-paper, #FFF6E8)'
                  : 'var(--poster-ink, #0E0E0E)',
              border: '1px solid var(--poster-ink, #0E0E0E)',
              cursor: 'pointer',
            }}
          >
            1990 ₽ / год{' '}
            <span style={{ opacity: 0.7, fontSize: 11 }}>−44%</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handlePay}
          disabled={loading}
          data-testid="paywall-pay-button"
          style={{
            width: '100%',
            padding: '16px',
            background: 'var(--poster-coral, #FF5A3C)',
            color: 'var(--poster-paper, #FFF6E8)',
            border: 'none',
            fontFamily: 'var(--poster-font-archivo-black), sans-serif',
            fontSize: 14,
            letterSpacing: '0.14em',
            cursor: 'pointer',
          }}
        >
          {loading ? 'ПЕРЕНАПРАВЛЕНИЕ…' : 'ОПЛАТИТЬ ЧЕРЕЗ ЮKASSA →'}
        </button>
        {error && (
          <div
            role="alert"
            data-testid="paywall-error"
            style={{
              marginTop: 12,
              color: 'var(--poster-red, #C24A2A)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          data-testid="paywall-close"
          style={{
            marginTop: 16,
            background: 'none',
            border: 'none',
            color: 'var(--poster-ink, #0E0E0E)',
            fontFamily: 'var(--poster-font-jet-brains-mono)',
            fontSize: 11,
            letterSpacing: '0.14em',
            opacity: 0.6,
            cursor: 'pointer',
          }}
        >
          ОТМЕНА
        </button>
      </div>
    </div>
  );
}
