// Phase 25-06: V10MainShell — composes PosterRouterProvider (root=OnboardingMount)
// + BottomNavV10 + AddSheet PosterSheet binding.
//
// Per Plan 25-06 final architecture decision (Task 2): the PosterRouter root
// is OnboardingMount (which itself fetches /me and renders either OnboardingFlow
// or HomeMount). HomeMount is rendered ONE LEVEL DEEPER, inside OnboardingMount's
// onboarded branch — but it lives inside V10MainShell's PosterRouterProvider
// so usePosterRouter() inside HomeMount works.
//
// Tests mock OnboardingMount to a stub (so we don't have to mock /me too) and
// focus on shell composition: BottomNav visibility, FAB → AddSheet open,
// Escape → close, tab → push WIP placeholder, no Transactions tab (TXN-V10-06).
//
// vitest does NOT auto-cleanup (src/test/setup.ts only imports jest-dom).
// We rely on explicit afterEach(cleanup) per Plan 25-02 SUMMARY note.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, within } from '@testing-library/react';

// Mock OnboardingMount to a simple stub — V10MainShell uses it as PosterRouter root.
vi.mock('../Onboarding/OnboardingMount', () => ({
  OnboardingMount: () => (
    <div data-testid="onboarding-mount-stub">ONBOARDING-OR-HOME</div>
  ),
}));

import { V10MainShell } from '../V10MainShell';

afterEach(cleanup);

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

  it('FAB tap opens AddSheet placeholder and hides BottomNav', () => {
    render(<V10MainShell />);
    fireEvent.click(
      screen.getByRole('button', { name: /Добавить транзакцию/ }),
    );
    // Sheet content visible (placeholder copy).
    expect(screen.getByText(/Plan 25-10/)).toBeInTheDocument();
    // BottomNav unmounted (BottomNavV10 returns null when isHidden=true).
    expect(screen.queryByRole('tab', { name: /ГЛАВНАЯ/ })).toBeNull();
  });

  it('Escape key closes AddSheet and restores BottomNav', () => {
    render(<V10MainShell />);
    fireEvent.click(
      screen.getByRole('button', { name: /Добавить транзакцию/ }),
    );
    expect(screen.getByText(/Plan 25-10/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/Plan 25-10/)).toBeNull();
    expect(
      screen.getByRole('tab', { name: /ГЛАВНАЯ/ }),
    ).toBeInTheDocument();
  });

  it('Close button inside sheet dismisses AddSheet', () => {
    render(<V10MainShell />);
    fireEvent.click(
      screen.getByRole('button', { name: /Добавить транзакцию/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: /ЗАКРЫТЬ/ }));
    expect(screen.queryByText(/Plan 25-10/)).toBeNull();
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
