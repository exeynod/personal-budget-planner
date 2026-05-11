// Phase 35-03 (REQ-35-03): PaywallSheet unit tests.
//
// Mocks api/tier (getMyTier) and api/billing (createPayment) so the component
// can be tested in isolation without the apiFetch fetch stack.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { PaywallSheet } from '../PaywallSheet';

afterEach(cleanup);

vi.mock('../../api/tier', () => ({
  getMyTier: vi.fn().mockResolvedValue({
    tier: 'free',
    trial_ends_at: null,
    pro_active_until: null,
    is_trial_active: false,
  }),
}));

vi.mock('../../api/billing', () => ({
  createPayment: vi.fn().mockResolvedValue({
    payment_id: 1,
    confirmation_url: 'https://yookassa.ru/confirm/test',
  }),
}));

describe('PaywallSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <PaywallSheet isOpen={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows monthly period selected by default', async () => {
    render(<PaywallSheet isOpen={true} onClose={() => {}} />);
    const monthlyBtn = await screen.findByTestId('period-monthly');
    expect(monthlyBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('switches to annual period when clicked', () => {
    render(<PaywallSheet isOpen={true} onClose={() => {}} />);
    const annualBtn = screen.getByTestId('period-annual');
    fireEvent.click(annualBtn);
    expect(annualBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('triggers createPayment with monthly amount on pay click', async () => {
    const { createPayment } = await import('../../api/billing');
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost/', assign: vi.fn() },
      writable: true,
    });
    render(<PaywallSheet isOpen={true} onClose={() => {}} />);
    const payBtn = screen.getByTestId('paywall-pay-button');
    fireEvent.click(payBtn);
    await waitFor(() =>
      expect(createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ amount_cents: 29900 }),
      ),
    );
  });

  it('triggers createPayment with annual amount when annual selected', async () => {
    const { createPayment } = await import('../../api/billing');
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost/', assign: vi.fn() },
      writable: true,
    });
    render(<PaywallSheet isOpen={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('period-annual'));
    fireEvent.click(screen.getByTestId('paywall-pay-button'));
    await waitFor(() =>
      expect(createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ amount_cents: 199000 }),
      ),
    );
  });
});
