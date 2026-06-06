// Phase 24-08: Final view + atomic submit handler.
// Render block collapsed to one smoke; submit branches (200/409/422/network/
// replay) kept distinct — threats T-24-08-03/04/05.

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

vi.mock('../../../api/onboardingV10', async () => {
  const actual = await vi.importActual<
    typeof import('../../../api/onboardingV10')
  >('../../../api/onboardingV10');
  return { ...actual, postOnboardingComplete: vi.fn() };
});

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

const post = postOnboardingComplete as ReturnType<typeof vi.fn>;
const startBtn = () => screen.getByRole('button', { name: /НАЧАТЬ/ });

describe('Final — render', () => {
  it('smoke: headers, 4 summary rows with formatted values, «без цели» when goal null', () => {
    const { rerender } = render(
      <Final state={SAMPLE_STATE} onComplete={vi.fn()} />,
    );
    expect(screen.getByText('VOL.04 · ГОТОВО')).toBeInTheDocument();
    expect(screen.getByText('ВСЁ.')).toBeInTheDocument();
    expect(screen.getByText(/под контролем/)).toBeInTheDocument();
    for (const label of ['ДОХОД', 'СЧЕТА', 'ПЛАН', 'ЦЕЛЬ']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(/120.000 ₽ \/ мес/)).toBeInTheDocument(); // income
    expect(screen.getByText(/2 · 80.000 ₽/)).toBeInTheDocument(); // accounts count + sum
    expect(screen.getByText(/100.000 ₽ распределено/)).toBeInTheDocument(); // plan Σ
    expect(screen.getByText(/Грузия · 200.000 ₽/)).toBeInTheDocument(); // goal
    expect(startBtn()).toBeInTheDocument();
    rerender(
      <Final state={{ ...SAMPLE_STATE, goal: null }} onComplete={vi.fn()} />,
    );
    expect(screen.getByText('без цели')).toBeInTheDocument();
  });
});

describe('Final — submit handler', () => {
  it('200 OK → serialised body (no step/goal-when-null), clears draft, onComplete(response)', async () => {
    const onComplete = vi.fn();
    post.mockResolvedValue(SAMPLE_RESPONSE);
    render(<Final state={SAMPLE_STATE} onComplete={onComplete} />);
    fireEvent.click(startBtn());
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const body = post.mock.calls[0][0];
    expect(body).not.toHaveProperty('step');
    expect(body.income_cents).toBe(12_000_000);
    expect(body.goal).toEqual({ name: 'Грузия', target_cents: 200_000_00 });
    await waitFor(() => {
      expect(mockClear).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(SAMPLE_RESPONSE);
    });
    // goal=null → body omits goal key
    cleanup();
    post.mockClear();
    render(
      <Final state={{ ...SAMPLE_STATE, goal: null }} onComplete={vi.fn()} />,
    );
    fireEvent.click(startBtn());
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls.at(-1)?.[0]).not.toHaveProperty('goal');
  });

  it('409 → clears draft, shows «уже завершили», eventually onComplete(null) (T-24-08-05)', async () => {
    const onComplete = vi.fn();
    post.mockRejectedValue(new ApiError('conflict', 409, '{}'));
    render(<Final state={SAMPLE_STATE} onComplete={onComplete} />);
    fireEvent.click(startBtn());
    await waitFor(() =>
      expect(
        screen.getByText(/вы уже завершили онбординг/),
      ).toBeInTheDocument(),
    );
    expect(mockClear).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(null), {
      timeout: 3000,
    });
  });

  it('422 / network → generic toast, no clear, no onComplete (T-24-08-04)', async () => {
    const onComplete = vi.fn();
    post.mockRejectedValue(new ApiError('unprocessable', 422, '{}'));
    render(<Final state={SAMPLE_STATE} onComplete={onComplete} />);
    fireEvent.click(startBtn());
    await waitFor(() =>
      expect(screen.getByText(/Проверьте план/)).toBeInTheDocument(),
    );
    expect(mockClear).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    // network error → «Ошибка сети»
    cleanup();
    post.mockRejectedValue(new TypeError('fetch failed'));
    render(<Final state={SAMPLE_STATE} onComplete={onComplete} />);
    fireEvent.click(startBtn());
    await waitFor(() =>
      expect(screen.getByText(/Ошибка сети/)).toBeInTheDocument(),
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('CTA disabled while submitting → single POST (T-24-08-03 replay guard)', async () => {
    const onComplete = vi.fn();
    let resolvePost!: (v: typeof SAMPLE_RESPONSE) => void;
    post.mockReturnValue(
      new Promise<typeof SAMPLE_RESPONSE>((res) => {
        resolvePost = res;
      }),
    );
    render(<Final state={SAMPLE_STATE} onComplete={onComplete} />);
    const cta = startBtn() as HTMLButtonElement;
    fireEvent.click(cta);
    await waitFor(() => expect(cta.disabled).toBe(true));
    fireEvent.click(cta); // replay while disabled
    expect(post).toHaveBeenCalledTimes(1);
    resolvePost(SAMPLE_RESPONSE);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});
