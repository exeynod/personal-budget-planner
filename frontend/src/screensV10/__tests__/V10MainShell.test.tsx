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
import { render, fireEvent, cleanup, screen, within, act } from '@testing-library/react';

// Mock OnboardingMount to a simple stub — V10MainShell uses it as PosterRouter root.
vi.mock('../Onboarding/OnboardingMount', () => ({
  OnboardingMount: () => (
    <div data-testid="onboarding-mount-stub">ONBOARDING-OR-HOME</div>
  ),
}));

// Mock the v10 API leaves the real AddSheet uses on mount.
vi.mock('../../api/v10', () => ({
  listAccounts: vi.fn().mockResolvedValue([]),
  listCategoriesV10: vi.fn().mockResolvedValue([]),
  createActualV10: vi.fn(),
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
    // 4 tab buttons + 1 FAB.
    expect(
      screen.getByRole('tab', { name: /ГЛАВНАЯ/ }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /КОПИЛКА/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /AI/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /УПР\./ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Добавить транзакцию/ }),
    ).toBeInTheDocument();
  });

  it('TXN-V10-06: no Transactions tab in BottomNav (4-tab + FAB layout)', () => {
    const { container } = render(<V10MainShell />);
    const tabBar = container.querySelector('[role="tablist"]');
    expect(tabBar).not.toBeNull();
    const labels = within(tabBar as HTMLElement)
      .queryAllByRole('tab')
      .map((b) => b.textContent ?? '');
    // Total tab buttons must be exactly 4.
    expect(labels).toHaveLength(4);
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
    expect(
      screen.getByRole('tab', { name: /ГЛАВНАЯ/ }),
    ).toBeInTheDocument();
  });

  it('AddSheet × button (clean form) dismisses the sheet', async () => {
    render(<V10MainShell />);
    fireEvent.click(
      screen.getByRole('button', { name: /Добавить транзакцию/ }),
    );
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button', { name: /Закрыть форму/ }));
    expect(screen.queryByText(/NEW ENTRY/)).toBeNull();
    expect(
      screen.getByRole('tab', { name: /ГЛАВНАЯ/ }),
    ).toBeInTheDocument();
  });

  it('Savings tab tap pushes a WIP placeholder via PosterRouter', () => {
    render(<V10MainShell />);
    fireEvent.click(screen.getByRole('tab', { name: /КОПИЛКА/ }));
    // AccountsListPlaceholder hint copy.
    expect(screen.getByText(/Phase 27/)).toBeInTheDocument();
    // Top of stack changed → onboarding-mount-stub hidden (root only renders
    // when its entry is the top of the stack).
    expect(screen.queryByTestId('onboarding-mount-stub')).toBeNull();
  });

  it('AI tab tap pushes a Plan-view WIP placeholder', () => {
    render(<V10MainShell />);
    fireEvent.click(screen.getByRole('tab', { name: /AI/ }));
    expect(screen.getByText(/Phase 26/)).toBeInTheDocument();
  });

  it('Mgmt tab tap pushes a Plan-view WIP placeholder', () => {
    render(<V10MainShell />);
    fireEvent.click(screen.getByRole('tab', { name: /УПР\./ }));
    expect(screen.getByText(/Phase 26/)).toBeInTheDocument();
  });

  it('Home tab tap after a push pops the stack back to root', () => {
    render(<V10MainShell />);
    fireEvent.click(screen.getByRole('tab', { name: /КОПИЛКА/ }));
    expect(screen.queryByTestId('onboarding-mount-stub')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /ГЛАВНАЯ/ }));
    expect(screen.getByTestId('onboarding-mount-stub')).toBeInTheDocument();
  });
});
