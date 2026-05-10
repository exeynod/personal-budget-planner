// Phase 27-06 Task 2: AccessView smoke tests — tab switching, users tab,
// AI usage tab, error / loading banners, back link.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';

import {
  AccessView,
  type AccessViewProps,
  type AccessUser,
  type AccessAiUsage,
} from '../AccessView';

afterEach(cleanup);

const SAMPLE_USERS: AccessUser[] = [
  { id: 1, tg_user_id: 11111, username: null, role: 'owner' },
  { id: 2, tg_user_id: 22222, username: 'alice', role: 'member' },
];

const SAMPLE_USAGE: AccessAiUsage[] = [
  { user_id: 1, name: 'owner', tokens: 12345, cost_cents: 4567 },
  { user_id: 2, name: 'alice', tokens: 9876, cost_cents: 1234 },
];

function makeProps(overrides: Partial<AccessViewProps> = {}): AccessViewProps {
  return {
    users: SAMPLE_USERS,
    aiUsage: SAMPLE_USAGE,
    activeTab: 'users',
    onSwitchTab: vi.fn(),
    loading: false,
    error: null,
    canPop: true,
    onBack: vi.fn(),
    ...overrides,
  };
}

describe('AccessView — composition', () => {
  it('renders headline «Доступ.»', () => {
    render(<AccessView {...makeProps()} />);
    expect(screen.getByText(/Доступ\./)).toBeInTheDocument();
  });

  it('renders ACCESS eyebrow', () => {
    render(<AccessView {...makeProps()} />);
    expect(screen.getByText(/ACCESS/)).toBeInTheDocument();
  });

  it('renders both tab chips «Пользователи» and «AI Usage»', () => {
    render(<AccessView {...makeProps()} />);
    expect(screen.getByRole('tab', { name: /Пользователи/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /AI Usage/ })).toBeInTheDocument();
  });

  it('users tab is active by default and shows user rows', () => {
    render(<AccessView {...makeProps({ activeTab: 'users' })} />);
    expect(
      screen.getByRole('tab', { name: /Пользователи/ }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('users-tab')).toBeInTheDocument();
    // Username fallback (ID 11111) and explicit username 'alice'.
    expect(screen.getByText(/alice/)).toBeInTheDocument();
    expect(screen.getByText(/ID 11111/)).toBeInTheDocument();
  });

  it('switch tab → calls onSwitchTab("ai-usage")', () => {
    const onSwitchTab = vi.fn();
    render(<AccessView {...makeProps({ onSwitchTab })} />);
    fireEvent.click(screen.getByRole('tab', { name: /AI Usage/ }));
    expect(onSwitchTab).toHaveBeenCalledWith('ai-usage');
  });

  it('ai-usage tab content renders tokens + cost', () => {
    render(<AccessView {...makeProps({ activeTab: 'ai-usage' })} />);
    expect(screen.getByTestId('ai-usage-tab')).toBeInTheDocument();
    // 12345 tok formatted ru-RU includes a space or non-breaking space; just match digits.
    expect(screen.getByText(/12.345 tok/)).toBeInTheDocument();
    expect(screen.getByText(/\$45\.67/)).toBeInTheDocument();
  });

  it('empty users list shows «Нет пользователей»', () => {
    render(<AccessView {...makeProps({ users: [], activeTab: 'users' })} />);
    expect(screen.getByText(/Нет пользователей/)).toBeInTheDocument();
  });

  it('empty ai-usage list shows «Нет данных»', () => {
    render(
      <AccessView {...makeProps({ aiUsage: [], activeTab: 'ai-usage' })} />,
    );
    expect(screen.getByText(/Нет данных/)).toBeInTheDocument();
  });

  it('error banner visible when error prop set', () => {
    render(<AccessView {...makeProps({ error: 'Только для владельца' })} />);
    expect(screen.getByText(/Только для владельца/)).toBeInTheDocument();
  });

  it('loading banner visible when loading=true', () => {
    render(<AccessView {...makeProps({ loading: true })} />);
    expect(screen.getByTestId('access-loading')).toBeInTheDocument();
  });

  it('back link calls onBack when canPop=true', () => {
    const onBack = vi.fn();
    render(<AccessView {...makeProps({ canPop: true, onBack })} />);
    fireEvent.click(screen.getByText(/← НАЗАД/));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
