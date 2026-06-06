// Phase 27-06 Task 1 RED: MgmtHubView — 5-row numbered list (owner) /
// 4-row numbered list (member, no «ДОСТУП»), plus tap callbacks + back link.
//
// View is router-agnostic — uses props for isOwner / onRowTap / canPop / onBack.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';

import { MgmtHubView, type MgmtRowId } from '../MgmtHubView';

afterEach(cleanup);

function makeProps(
  overrides: Partial<React.ComponentProps<typeof MgmtHubView>> = {},
) {
  return {
    isOwner: true,
    onRowTap: vi.fn(),
    canPop: true,
    onBack: vi.fn(),
    ...overrides,
  };
}

describe('MgmtHubView — composition', () => {
  it('renders headline «Управление.»', () => {
    render(<MgmtHubView {...makeProps()} />);
    expect(screen.getByText(/Управление\./)).toBeInTheDocument();
  });

  it('renders MANAGEMENT eyebrow', () => {
    render(<MgmtHubView {...makeProps()} />);
    expect(screen.getByText(/MANAGEMENT/)).toBeInTheDocument();
  });

  it('renders all 5 numbered rows when isOwner=true', () => {
    render(<MgmtHubView {...makeProps({ isOwner: true })} />);
    expect(screen.getByText(/PLAN МЕСЯЦА/)).toBeInTheDocument();
    expect(screen.getByText(/АНАЛИТИКА/)).toBeInTheDocument();
    expect(screen.getByText(/ПОДПИСКИ/)).toBeInTheDocument();
    expect(screen.getByText(/НАСТРОЙКИ/)).toBeInTheDocument();
    expect(screen.getByText(/ДОСТУП/)).toBeInTheDocument();
  });

  it('renders only 4 rows when isOwner=false (no «ДОСТУП»)', () => {
    render(<MgmtHubView {...makeProps({ isOwner: false })} />);
    expect(screen.getByText(/PLAN МЕСЯЦА/)).toBeInTheDocument();
    expect(screen.getByText(/АНАЛИТИКА/)).toBeInTheDocument();
    expect(screen.getByText(/ПОДПИСКИ/)).toBeInTheDocument();
    expect(screen.getByText(/НАСТРОЙКИ/)).toBeInTheDocument();
    expect(screen.queryByText(/ДОСТУП/)).toBeNull();
  });

  it('renders mono numbers «01..05» for owner', () => {
    render(<MgmtHubView {...makeProps({ isOwner: true })} />);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();
    expect(screen.getByText('04')).toBeInTheDocument();
    expect(screen.getByText('05')).toBeInTheDocument();
  });

  it('row click on «PLAN МЕСЯЦА» calls onRowTap("plan")', () => {
    const onRowTap = vi.fn();
    render(<MgmtHubView {...makeProps({ onRowTap })} />);
    fireEvent.click(screen.getByText(/PLAN МЕСЯЦА/));
    expect(onRowTap).toHaveBeenCalledWith('plan' satisfies MgmtRowId);
  });

  it('row click on «ПОДПИСКИ» calls onRowTap("subscriptions")', () => {
    const onRowTap = vi.fn();
    render(<MgmtHubView {...makeProps({ onRowTap })} />);
    fireEvent.click(screen.getByText(/ПОДПИСКИ/));
    expect(onRowTap).toHaveBeenCalledWith('subscriptions' satisfies MgmtRowId);
  });

  it('row click on «АНАЛИТИКА» calls onRowTap("analytics")', () => {
    const onRowTap = vi.fn();
    render(<MgmtHubView {...makeProps({ onRowTap })} />);
    fireEvent.click(screen.getByText(/АНАЛИТИКА/));
    expect(onRowTap).toHaveBeenCalledWith('analytics' satisfies MgmtRowId);
  });

  it('row click on «НАСТРОЙКИ» calls onRowTap("settings")', () => {
    const onRowTap = vi.fn();
    render(<MgmtHubView {...makeProps({ onRowTap })} />);
    fireEvent.click(screen.getByText(/НАСТРОЙКИ/));
    expect(onRowTap).toHaveBeenCalledWith('settings' satisfies MgmtRowId);
  });

  it('row click on «ДОСТУП» (owner) calls onRowTap("access")', () => {
    const onRowTap = vi.fn();
    render(<MgmtHubView {...makeProps({ isOwner: true, onRowTap })} />);
    fireEvent.click(screen.getByText(/ДОСТУП/));
    expect(onRowTap).toHaveBeenCalledWith('access' satisfies MgmtRowId);
  });

  it('back link visible when canPop=true; tap calls onBack', () => {
    const onBack = vi.fn();
    render(<MgmtHubView {...makeProps({ canPop: true, onBack })} />);
    const back = screen.getByText(/← НАЗАД/);
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('back link hidden when canPop=false', () => {
    render(<MgmtHubView {...makeProps({ canPop: false })} />);
    expect(screen.queryByText(/← НАЗАД/)).toBeNull();
  });
});
