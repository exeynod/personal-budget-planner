// Phase 27-03 Task 3: SavingsMount smoke test.
//
// Coverage (minimal — full integration deferred to Phase 28):
//   1. Renders loading state initially.
//   2. After mocked fetch resolves, renders Mass «Копилка.» + total cents.
//   3. Toggle click invokes patchSavingsConfig with negated value.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  cleanup,
  waitFor,
  fireEvent,
  screen,
} from '@testing-library/react';
import { PosterRouterProvider } from '../../common/PosterRouter';
import { SavingsMount } from '../SavingsMount';

const fetchSavingsSummary = vi.fn();
const patchSavingsConfig = vi.fn();
const postDeposit = vi.fn();
const createGoal = vi.fn();
const listAccounts = vi.fn();

vi.mock('../../../api/v10', async () => {
  return {
    fetchSavingsSummary: (...args: unknown[]) => fetchSavingsSummary(...args),
    patchSavingsConfig: (...args: unknown[]) => patchSavingsConfig(...args),
    postDeposit: (...args: unknown[]) => postDeposit(...args),
    createGoal: (...args: unknown[]) => createGoal(...args),
    listAccounts: (...args: unknown[]) => listAccounts(...args),
  };
});

afterEach(() => {
  cleanup();
  fetchSavingsSummary.mockReset();
  patchSavingsConfig.mockReset();
  postDeposit.mockReset();
  createGoal.mockReset();
  listAccounts.mockReset();
});

function renderWithRouter(node: React.ReactNode) {
  return render(<PosterRouterProvider root={node} />);
}

describe('SavingsMount', () => {
  it('renders loading state initially', () => {
    fetchSavingsSummary.mockImplementation(() => new Promise(() => {}));
    listAccounts.mockImplementation(() => new Promise(() => {}));
    const { getByTestId } = renderWithRouter(<SavingsMount />);
    expect(getByTestId('savings-loading')).toBeTruthy();
  });

  it('renders SavingsView with headline + sections after fetch resolves', async () => {
    fetchSavingsSummary.mockResolvedValue({
      total_cents: 1_234_500,
      month_in_cents: 50_000,
      config: { roundup_enabled: true, roundup_base: 10 },
      goals: [],
    });
    listAccounts.mockResolvedValue([]);
    const { container } = renderWithRouter(<SavingsMount />);
    await waitFor(() => {
      expect(container.textContent).toContain('Копилка.');
    });
    // BigFig count-up animation lags total — assert the static section labels
    // and the month-in eyebrow value (rendered immediately, no RAF).
    const text = container.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('НАКОПЛЕНО ВСЕГО');
    expect(text).toContain('ОКРУГЛЕНИЕ ТРАТ');
    expect(text).toContain('ЦЕЛИ');
    // month_in_cents = 50_000 → 500 руб
    expect(text).toMatch(/\+\s?500/);
  });

  it('toggle click triggers patchSavingsConfig with negated value', async () => {
    fetchSavingsSummary.mockResolvedValue({
      total_cents: 0,
      month_in_cents: 0,
      config: { roundup_enabled: true, roundup_base: 10 },
      goals: [],
    });
    listAccounts.mockResolvedValue([]);
    patchSavingsConfig.mockResolvedValue({
      roundup_enabled: false,
      roundup_base: 10,
    });
    renderWithRouter(<SavingsMount />);
    await waitFor(() => screen.getByTestId('roundup-toggle'));
    fireEvent.click(screen.getByTestId('roundup-toggle'));
    await waitFor(() =>
      expect(patchSavingsConfig).toHaveBeenCalledWith({
        roundup_enabled: false,
      }),
    );
  });
});
