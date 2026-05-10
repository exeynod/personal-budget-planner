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
import { render, cleanup, waitFor } from '@testing-library/react';
import { PosterRouterProvider } from '../../common/PosterRouter';

vi.mock('../../../api/v10', async () => {
  return {
    fetchObservation: vi.fn(async () => ({
      text: 'Май в плюсе на 12 345 ₽',
      generated_at: '2026-05-09T09:00:00Z',
    })),
  };
});

vi.mock('../../../api/ai', () => ({
  streamChat: vi.fn(),
}));

// AiMount must be imported AFTER vi.mock so Vitest hoists the mocks.
import { AiMount } from '../AiMount';
import { fetchObservation } from '../../../api/v10';

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
});
