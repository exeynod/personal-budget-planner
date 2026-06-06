// Phase 25-06 → 25-10: V10MainShell — composes PosterRouterProvider (root=OnboardingMount)
// + BottomNavV10 + AddSheet PosterSheet binding.
//
// Per Plan 25-06 final architecture decision (Task 2): the PosterRouter root
// is OnboardingMount (which itself fetches /me and renders either OnboardingFlow
// or HomeMount). HomeMount is rendered ONE LEVEL DEEPER, inside OnboardingMount's
// onboarded branch — but it lives inside V10MainShell's PosterRouterProvider
// so usePosterRouter() inside HomeMount works.
//
// Plan 25-10 swap: the AddSheet PosterSheet content is now the REAL AddSheet
// (real keypad + form + submit). Tests mock the v10 API leaves so the AddSheet
// renders without network. The AddSheet placeholder content is gone.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  render,
  fireEvent,
  cleanup,
  screen,
  within,
  act,
} from '@testing-library/react';

// Mock OnboardingMount to a simple stub — V10MainShell uses it as PosterRouter root.
vi.mock('../Onboarding/OnboardingMount', () => ({
  OnboardingMount: () => (
    <div data-testid="onboarding-mount-stub">ONBOARDING-OR-HOME</div>
  ),
}));

// Mock the v10 API leaves the real AddSheet + Phase 27 mounts use.
vi.mock('../../api/v10', () => ({
  listAccounts: vi.fn().mockResolvedValue([]),
  createAccount: vi.fn(),
  listCategoriesV10: vi.fn().mockResolvedValue([]),
  createActualV10: vi.fn(),
  listActualV10: vi.fn().mockResolvedValue([]),
  // Phase 27 — AI observation
  fetchObservation: vi.fn().mockResolvedValue({
    text: '',
    generated_at: new Date().toISOString(),
  }),
  // Phase 27 — Analytics
  fetchTopCategories: vi.fn().mockResolvedValue([]),
}));

// Phase 27 — AI screen reuses v0.6 SSE chat. Mock the streaming entry-point.
vi.mock('../../api/ai', () => ({
  streamChat: vi.fn(() => () => {}),
  fetchAiHistory: vi.fn().mockResolvedValue([]),
  clearAiHistory: vi.fn(),
}));

vi.mock('../../api/periods', () => ({
  listPeriods: vi.fn().mockResolvedValue([]),
  getCurrentPeriod: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../api/analytics', () => ({
  fetchTrend: vi.fn().mockResolvedValue({ buckets: [] }),
  fetchTopCategories: vi.fn().mockResolvedValue([]),
}));

// Phase 27-06: Mgmt tab mounts MgmtHubMount, which calls fetchMeV10. Mock it
// so the test does not require network. Default role='member' so the «ДОСТУП»
// row stays hidden by default; individual tests override as needed.
vi.mock('../../api/me', () => ({
  getMeV10: vi.fn().mockResolvedValue({
    tg_user_id: 1,
    tg_chat_id: null,
    cycle_start_day: 1,
    onboarded_at: null,
    chat_id_known: false,
    role: 'member',
    ai_spend_cents: 0,
    ai_spending_cap_cents: 0,
    income_cents: null,
  }),
}));

// SettingsMount / AccessMount may be pushed during Mgmt navigation; mock
// their data sources so the tests don't depend on the real fetch.
vi.mock('../../api/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({
    cycle_start_day: 1,
    notify_days_before: 2,
    is_bot_bound: false,
    enable_ai_categorization: true,
  }),
  updateSettings: vi.fn(),
}));

vi.mock('../../api/admin', () => ({
  listAdminUsers: vi.fn().mockResolvedValue([]),
  getAdminAiUsage: vi.fn().mockResolvedValue({ users: [], generated_at: '' }),
  inviteAdminUser: vi.fn(),
  revokeAdminUser: vi.fn(),
  updateAdminUserCap: vi.fn(),
}));

import { V10MainShell } from '../V10MainShell';

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('V10MainShell — composition', () => {
  it('renders the V10 shell wrapper with the router root mounted', () => {
    render(<V10MainShell />);
    expect(screen.getByTestId('v10-shell')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-mount-stub')).toBeInTheDocument();
  });

  it('BottomNavV10 is visible by default with home tab active', () => {
    render(<V10MainShell />);
    // 3 tab buttons + 1 FAB.
    expect(screen.getByRole('tab', { name: /ГЛАВНАЯ/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /AI/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /УПР\./ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Добавить транзакцию/ }),
    ).toBeInTheDocument();
  });

  it('TXN-V10-06: no Transactions tab in BottomNav (3-tab + FAB layout)', () => {
    const { container } = render(<V10MainShell />);
    const tabBar = container.querySelector('[role="tablist"]');
    expect(tabBar).not.toBeNull();
    const labels = within(tabBar as HTMLElement)
      .queryAllByRole('tab')
      .map((b) => b.textContent ?? '');
    // Total tab buttons must be exactly 3 (savings tab removed).
    expect(labels).toHaveLength(3);
    for (const text of labels) {
      expect(text).not.toMatch(/Транзакции|Реестр|Transactions/);
    }
  });

  it('FAB tap opens the real AddSheet and hides BottomNav', async () => {
    render(<V10MainShell />);
    fireEvent.click(
      screen.getByRole('button', { name: /Добавить транзакцию/ }),
    );
    await flushMicrotasks();
    // Real AddSheet renders its NEW ENTRY eyebrow.
    expect(screen.getByText(/NEW ENTRY/)).toBeInTheDocument();
    // BottomNav unmounted (BottomNavV10 returns null when isHidden=true).
    expect(screen.queryByRole('tab', { name: /ГЛАВНАЯ/ })).toBeNull();
  });

  it('Escape key closes AddSheet and restores BottomNav', async () => {
    render(<V10MainShell />);
    fireEvent.click(
      screen.getByRole('button', { name: /Добавить транзакцию/ }),
    );
    await flushMicrotasks();
    expect(screen.getByText(/NEW ENTRY/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/NEW ENTRY/)).toBeNull();
    expect(screen.getByRole('tab', { name: /ГЛАВНАЯ/ })).toBeInTheDocument();
  });

  it('AddSheet × button (clean form) dismisses the sheet', async () => {
    render(<V10MainShell />);
    fireEvent.click(
      screen.getByRole('button', { name: /Добавить транзакцию/ }),
    );
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button', { name: /Закрыть форму/ }));
    expect(screen.queryByText(/NEW ENTRY/)).toBeNull();
    expect(screen.getByRole('tab', { name: /ГЛАВНАЯ/ })).toBeInTheDocument();
  });

  it('AI tab tap pushes the real AiMount (Phase 27 wire)', () => {
    render(<V10MainShell />);
    fireEvent.click(screen.getByRole('tab', { name: /AI/ }));
    // Real AiView renders «AI · ASSISTANT» eyebrow on initial state.
    expect(screen.getByText(/AI · ASSISTANT/i)).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-mount-stub')).toBeNull();
  });

  it('Mgmt tab tap pushes MgmtHubMount with the «Управление.» hub', async () => {
    render(<V10MainShell />);
    fireEvent.click(screen.getByRole('tab', { name: /УПР\./ }));
    // Hub headline is rendered synchronously (isOwner state defaults to false).
    expect(screen.getByText(/Управление\./)).toBeInTheDocument();
    // 4-row variant for non-owner role: PLAN МЕСЯЦА / СЧЕТА / АНАЛИТИКА / НАСТРОЙКИ.
    expect(screen.getByText(/PLAN МЕСЯЦА/)).toBeInTheDocument();
    // Wait for /me promise to resolve so the role-state settles to 'member'.
    await flushMicrotasks();
    // ДОСТУП still hidden because role='member' is the default mocked above.
    expect(screen.queryByText(/ДОСТУП/)).toBeNull();
  });

  it('Home tab tap after a push pops the stack back to root', () => {
    render(<V10MainShell />);
    fireEvent.click(screen.getByRole('tab', { name: /AI/ }));
    expect(screen.queryByTestId('onboarding-mount-stub')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /ГЛАВНАЯ/ }));
    expect(screen.getByTestId('onboarding-mount-stub')).toBeInTheDocument();
  });
});
