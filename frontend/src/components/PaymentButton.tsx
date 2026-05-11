// Phase 34-06 (REQ-34-04): minimal "Оплатить через ЮKassa" trigger.
//
// Calls POST /api/v1/billing/create-payment and redirects to the
// `confirmation_url` returned by ЮKassa. After successful payment ЮKassa
// returns the user to `return_url` (current page); webhook на бэкенде
// активирует Pro подписку asynchronously.
//
// data-testid="pay-via-yookassa" — для Playwright (Phase 34 UAT).

import { useState } from 'react';
import { createPayment } from '../api/billing';

interface Props {
  amountCents: number;
  description?: string;
  className?: string;
}

export function PaymentButton({ amountCents, description, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const result = await createPayment({
        amount_cents: amountCents,
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

  return (
    <div className={className}>
      <button onClick={handleClick} disabled={loading} data-testid="pay-via-yookassa">
        {loading ? 'Перенаправление…' : 'Оплатить через ЮKassa'}
      </button>
      {error && <div role="alert">{error}</div>}
    </div>
  );
}
