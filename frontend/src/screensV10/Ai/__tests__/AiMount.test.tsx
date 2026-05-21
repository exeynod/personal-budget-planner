// Phase 27-02 Task 3: AiMount smoke tests.
//
// Coverage (minimal — full SSE flow exercised manually + e2e in Phase 28):
//   1. Initial render shows obs-loading placeholder.
//   2. After fetchObservation resolves, obs-text shows the mocked observation.
//   3. On fetchObservation rejection, obs-error renders.
//
// Mocking strategy: vi.mock the api/v10 + api/ai modules; render inside
// PosterRouterProvider so usePosterRouter() resolves to a no-op router.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { PosterRouterProvider } from '../../common/PosterRouter';
import type { AiStreamEvent } from '../../../api/types';

vi.mock('../../../api/v10', async () => {
  return {
    fetchObservation: vi.fn(async () => ({
      text: 'Май в плюсе на 12 345 ₽',
      generated_at: '2026-05-09T09:00:00Z',
    })),
  };
});

// Phase 71 (UX-71): keep the real PRO_TIER_* constants from api/ai but stub
// streamChat so tests can drive the SSE event stream deterministically.
vi.mock('../../../api/ai', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/ai')>('../../../api/ai');
  return {
    ...actual,
    streamChat: vi.fn(),
  };
});

// AiMount must be imported AFTER vi.mock so Vitest hoists the mocks.
import { AiMount } from '../AiMount';
import { fetchObservation } from '../../../api/v10';
import { streamChat, PRO_TIER_ERROR_MARKER } from '../../../api/ai';

afterEach(cleanup);

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderWithRouter() {
  return render(<PosterRouterProvider root={<AiMount />} />);
}

describe('AiMount', () => {
  it('shows obs-loading initially then obs-text after fetch resolves', async () => {
    const { getByTestId, queryByTestId } = renderWithRouter();
    // Initial render — observation fetch in flight.
    expect(getByTestId('obs-loading')).toBeInTheDocument();
    // Wait for the observation to resolve and replace loading.
    await waitFor(() => {
      expect(queryByTestId('obs-loading')).toBeNull();
    });
    expect(getByTestId('obs-text')).toHaveTextContent('Май в плюсе на 12 345 ₽');
  });

  it('renders obs-error when fetchObservation rejects', async () => {
    (fetchObservation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('boom'),
    );
    const { getByTestId, queryByTestId } = renderWithRouter();
    await waitFor(() => {
      expect(queryByTestId('obs-loading')).toBeNull();
    });
    expect(getByTestId('obs-error')).toHaveTextContent(
      'Не удалось загрузить наблюдение',
    );
  });

  it('renders 4 chips even when observation is loading', () => {
    const { getAllByTestId } = renderWithRouter();
    expect(getAllByTestId(/^ai-chip-/)).toHaveLength(4);
  });

  it('renders the fixed Pro-tier message (not "HTTP 402") when streamChat emits PRO_TIER_ERROR_MARKER', async () => {
    // streamChat surfaces a 402 PRO_TIER_REQUIRED as the opaque marker; the
    // AI bubble must show the fixed RU paywall copy with no server-detail leak.
    (streamChat as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (
        _msg: string,
        onEvent: (e: AiStreamEvent) => void,
        onDone: () => void,
      ) => {
        onEvent({ type: 'error', data: PRO_TIER_ERROR_MARKER });
        onDone();
      },
    );

    const { getByTestId, getByText, queryByText } = renderWithRouter();
    await waitFor(() => {
      expect(getByTestId('ai-chip-0')).toBeInTheDocument();
    });

    fireEvent.click(getByTestId('ai-chip-0'));

    await waitFor(() => {
      expect(getByText('Чат-ассистент доступен в Pro-тарифе')).toBeInTheDocument();
    });
    // The raw HTTP signal / marker must never reach the UI verbatim.
    expect(queryByText(/HTTP 402/)).toBeNull();
    expect(queryByText(/PRO_TIER_REQUIRED/)).toBeNull();
  });
});
