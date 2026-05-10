// Phase 24-08: Final view + atomic submit handler integration tests.
//
// Covers must_haves:
//   - Renders eyebrow «VOL.04 · ГОТОВО» + Mass «ВСЁ.» + DM Serif italic
//     «деньги — под контролем.»
//   - Renders 4 summary plate rows (ДОХОД / СЧЕТА / ПЛАН / ЦЕЛЬ)
//   - With goal=null → ЦЕЛЬ row shows «без цели»
//   - Click «НАЧАТЬ →» → postOnboardingComplete called with serialised body
//   - 200 → draft.clear called, onComplete invoked with response
//   - 409 → draft.clear called, errorMsg displayed, onComplete called with null
//   - 422 → errorMsg displayed, onComplete NOT called, draft NOT cleared
//   - Network error → generic errorMsg
// Threat coverage:
//   - T-24-08-03: submitting state disables CTA (replay)
//   - T-24-08-04: error copy is generic russian, never echoes raw err.message
//   - T-24-08-05: 409 calls draft.clear() BEFORE onComplete

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  render,
  fireEvent,
  screen,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { Final } from '../Final';
import type { OnboardingDraft } from '../types';
import { ApiError } from '../../../api/client';

// Mock the API wrapper — every test sets up resolved/rejected per-case.
vi.mock('../../../api/onboardingV10', async () => {
  const actual = await vi.importActual<typeof import('../../../api/onboardingV10')>(
    '../../../api/onboardingV10',
  );
  return {
    ...actual,
    postOnboardingComplete: vi.fn(),
  };
});

// Mock the persistence hook — assert clear() is called on 200/409.
const mockClear = vi.fn();
vi.mock('../useOnboardingDraft', async () => {
  const actual = await vi.importActual<typeof import('../useOnboardingDraft')>(
    '../useOnboardingDraft',
  );
  return {
    ...actual,
    useOnboardingDraft: () => ({
      load: () => null,
      save: () => undefined,
      clear: mockClear,
    }),
  };
});

import { postOnboardingComplete } from '../../../api/onboardingV10';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockClear.mockClear();
});

const SAMPLE_STATE: OnboardingDraft = {
  step: 5,
  income_cents: 12_000_000, // 120 000 ₽
  accounts: [
    {
      bank: 'Tinkoff',
      kind: 'card',
      balance_cents: 5_000_000,
      mask: '4242',
      primary: true,
    },
    {
      bank: 'Сбер',
      kind: 'cash',
      balance_cents: 3_000_000,
      mask: null,
      primary: false,
    },
  ],
  category_plans: { food: 4_000_000, home: 6_000_000 },
  goal: { name: 'Грузия', target_cents: 200_000_00 },
  savings_config: null,
};

const SAMPLE_RESPONSE = {
  user_id: 1,
  income_cents: 12_000_000,
  account_ids: [11, 22],
  category_ids_by_code: { food: 1, home: 2 },
  savings_category_id: 9,
  goal_id: 7,
  savings_config: { roundup_enabled: false, roundup_base: 100 },
  onboarded_at: '2026-05-09T00:00:00Z',
};

describe('Final — render', () => {
  it('renders the eyebrow «VOL.04 · ГОТОВО»', () => {
    render(<Final state={SAMPLE_STATE} onComplete={vi.fn()} />);
    expect(screen.getByText('VOL.04 · ГОТОВО')).toBeInTheDocument();
  });

  it('renders the «ВСЁ.» Mass headline', () => {
    render(<Final state={SAMPLE_STATE} onComplete={vi.fn()} />);
    expect(screen.getByText('ВСЁ.')).toBeInTheDocument();
  });

  it('renders the «деньги — под контролем.» italic subtitle', () => {
    render(<Final state={SAMPLE_STATE} onComplete={vi.fn()} />);
    expect(screen.getByText(/деньги/)).toBeInTheDocument();
    expect(screen.getByText(/под контролем/)).toBeInTheDocument();
  });

  it('renders 4 summary plate row labels', () => {
    render(<Final state={SAMPLE_STATE} onComplete={vi.fn()} />);
    expect(screen.getByText('ДОХОД')).toBeInTheDocument();
    expect(screen.getByText('СЧЕТА')).toBeInTheDocument();
    expect(screen.getByText('ПЛАН')).toBeInTheDocument();
    expect(screen.getByText('ЦЕЛЬ')).toBeInTheDocument();
  });

  it('renders ДОХОД value formatted as rubles per month', () => {
    render(<Final state={SAMPLE_STATE} onComplete={vi.fn()} />);
    // 12_000_000 cents = 120 000 ₽
    expect(screen.getByText(/120.000 ₽ \/ мес/)).toBeInTheDocument();
  });

  it('renders СЧЕТА value as count + total balance', () => {
    render(<Final state={SAMPLE_STATE} onComplete={vi.fn()} />);
    // 2 accounts, sum = 8_000_000 cents = 80 000 ₽
    expect(screen.getByText(/2 · 80.000 ₽/)).toBeInTheDocument();
  });

  it('renders ПЛАН value as Σ распределено', () => {
    render(<Final state={SAMPLE_STATE} onComplete={vi.fn()} />);
    // food 4M + home 6M = 10_000_000 cents = 100 000 ₽
    expect(screen.getByText(/100.000 ₽ распределено/)).toBeInTheDocument();
  });

  it('renders ЦЕЛЬ value as name · amount when goal set', () => {
    render(<Final state={SAMPLE_STATE} onComplete={vi.fn()} />);
    // goal 200 000 ₽
    expect(screen.getByText(/Грузия · 200.000 ₽/)).toBeInTheDocument();
  });

  it('renders ЦЕЛЬ as «без цели» when goal=null', () => {
    const noGoal = { ...SAMPLE_STATE, goal: null };
    render(<Final state={noGoal} onComplete={vi.fn()} />);
    expect(screen.getByText('без цели')).toBeInTheDocument();
  });

  it('renders the «НАЧАТЬ →» CTA', () => {
    render(<Final state={SAMPLE_STATE} onComplete={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /НАЧАТЬ/ }),
    ).toBeInTheDocument();
  });
});

describe('Final — submit handler', () => {
  it('200 OK → calls postOnboardingComplete with serialised body, clears draft, calls onComplete with response', async () => {
    const onComplete = vi.fn();
    (postOnboardingComplete as ReturnType<typeof vi.fn>).mockResolvedValue(
      SAMPLE_RESPONSE,
    );
    render(<Final state={SAMPLE_STATE} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /НАЧАТЬ/ }));
    await waitFor(() => {
      expect(postOnboardingComplete).toHaveBeenCalledTimes(1);
    });
    const body = (postOnboardingComplete as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    // step is stripped; income_cents present; goal serialised
    expect(body).not.toHaveProperty('step');
    expect(body.income_cents).toBe(12_000_000);
    expect(body.goal).toEqual({ name: 'Грузия', target_cents: 200_000_00 });
    await waitFor(() => {
      expect(mockClear).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(SAMPLE_RESPONSE);
    });
  });

  it('200 OK with goal=null → body omits goal key', async () => {
    const onComplete = vi.fn();
    const noGoal = { ...SAMPLE_STATE, goal: null };
    (postOnboardingComplete as ReturnType<typeof vi.fn>).mockResolvedValue(
      SAMPLE_RESPONSE,
    );
    render(<Final state={noGoal} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /НАЧАТЬ/ }));
    await waitFor(() => {
      expect(postOnboardingComplete).toHaveBeenCalledTimes(1);
    });
    const body = (postOnboardingComplete as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(body).not.toHaveProperty('goal');
  });

  it('409 → clears draft, shows «вы уже завершили онбординг» toast, eventually calls onComplete(null)', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    (postOnboardingComplete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError('conflict', 409, '{}'),
    );
    render(<Final state={SAMPLE_STATE} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /НАЧАТЬ/ }));
    // Microtask queue flush — wait for promise rejection to settle.
    await vi.runAllTicksAsync();
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/вы уже завершили онбординг/),
    ).toBeInTheDocument();
    // onComplete is delayed — fast-forward.
    expect(onComplete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(onComplete).toHaveBeenCalledWith(null);
    vi.useRealTimers();
  });

  it('422 → shows error toast, does NOT clear draft, does NOT call onComplete', async () => {
    const onComplete = vi.fn();
    (postOnboardingComplete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError('unprocessable', 422, '{}'),
    );
    render(<Final state={SAMPLE_STATE} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /НАЧАТЬ/ }));
    await waitFor(() => {
      expect(
        screen.getByText(/Проверьте план/),
      ).toBeInTheDocument();
    });
    expect(mockClear).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('network error (no status) → shows generic «Ошибка сети» toast', async () => {
    const onComplete = vi.fn();
    (postOnboardingComplete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('fetch failed'),
    );
    render(<Final state={SAMPLE_STATE} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /НАЧАТЬ/ }));
    await waitFor(() => {
      expect(screen.getByText(/Ошибка сети/)).toBeInTheDocument();
    });
    expect(mockClear).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('CTA disabled while submitting (T-24-08-03 replay guard)', async () => {
    const onComplete = vi.fn();
    let resolvePost!: (v: typeof SAMPLE_RESPONSE) => void;
    const pending = new Promise<typeof SAMPLE_RESPONSE>((res) => {
      resolvePost = res;
    });
    (postOnboardingComplete as ReturnType<typeof vi.fn>).mockReturnValue(
      pending,
    );
    render(<Final state={SAMPLE_STATE} onComplete={onComplete} />);
    const cta = screen.getByRole('button', {
      name: /НАЧАТЬ/,
    }) as HTMLButtonElement;
    fireEvent.click(cta);
    await waitFor(() => {
      expect(cta.disabled).toBe(true);
    });
    // Replay click while disabled → still only one POST.
    fireEvent.click(cta);
    expect(postOnboardingComplete).toHaveBeenCalledTimes(1);
    resolvePost(SAMPLE_RESPONSE);
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });
});
