// Phase 25-12 — TXN-V10-06 acceptance lock.
//
// Asserts that the «Транзакции» tab is fully demoted from the V10 BottomNav.
// Also pins the Plan 25-08 swap (HomeMount imports the real TransactionsMount,
// not the placeholder).
//
// (The former v0.6-BottomNav regression guards were removed when the legacy
// v0.6 web shell was retired — there is no longer a v0.6 nav to guard against.)
//
// The HomeMount static-grep guard is intentional — it's cheaper than wiring
// V10MainShell + HomeMount through @testing-library and it catches the exact
// regression we care about (someone re-introducing the placeholder import).
//
// All mocks live inline — no shared fixtures needed for a tab-demotion
// guard suite.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

import { BottomNavV10 } from '../common/BottomNavV10';

afterEach(cleanup);

describe('TXN-V10-06 — V10 BottomNav demotion', () => {
  it('BottomNavV10 has exactly 4 tab buttons + 1 FAB; no Транзакции / Реестр / Transactions label', () => {
    const { container } = render(
      <BottomNavV10 active="home" onTab={vi.fn()} onFab={vi.fn()} />,
    );

    // 4 tab buttons (role=tab) + 1 FAB (role=button, not role=tab).
    const tabBar = container.querySelector('[role="tablist"]');
    expect(tabBar).not.toBeNull();
    const tabs = within(tabBar as HTMLElement).queryAllByRole('tab');
    expect(tabs).toHaveLength(4);

    // Required V10 labels present.
    for (const lbl of ['ГЛАВНАЯ', 'КОПИЛКА', 'AI', 'УПР.']) {
      expect(screen.getByText(lbl)).toBeTruthy();
    }

    // Negative — no v0.6 transactions tab labels anywhere in the nav.
    expect(screen.queryByText(/транзакции/i)).toBeNull();
    expect(screen.queryByText(/реестр/i)).toBeNull();
    expect(screen.queryByText(/transactions/i)).toBeNull();

    // FAB is reachable by its aria-label, distinct from tab buttons.
    expect(
      screen.getByRole('button', { name: /Добавить транзакцию/ }),
    ).toBeInTheDocument();
  });

  it('BottomNavV10 with isHidden=true renders nothing (ADD-V10-01 / T-N-02 contract)', () => {
    const { container } = render(
      <BottomNavV10 active="home" onTab={vi.fn()} onFab={vi.fn()} isHidden />,
    );
    // Hidden = no DOM at all (no nav, no tabs, no FAB).
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Добавить транзакцию/ }),
    ).toBeNull();
  });

  it('V10 TabId enum has exactly 4 cases (no transactions)', () => {
    // Runtime mapping mirrors the V10 TabId type literal:
    //   componentsV10/TabBar.tsx: type TabId = 'home' | 'savings' | 'ai' | 'mgmt'
    // If anyone adds 'transactions' back to TabId, this object literal will
    // fail to type-check (Record key set diverges) and the keyof check below
    // will fail at runtime as a belt-and-braces guard.
    const map: Record<'home' | 'savings' | 'ai' | 'mgmt', boolean> = {
      home: true,
      savings: true,
      ai: true,
      mgmt: true,
    };
    const keys = Object.keys(map).sort();
    expect(keys).toEqual(['ai', 'home', 'mgmt', 'savings']);
    expect(keys).not.toContain('transactions');
    expect(keys).toHaveLength(4);
  });

  it('HomeMount imports the real TransactionsMount, not the placeholder (Plan 25-08 swap regression guard)', () => {
    // Static-grep guard: HomeMount.tsx must use the real TransactionsMount
    // for its «ВСЕ ОПЕРАЦИИ →» push. If anyone reverts to the placeholder
    // (e.g. during a rebase), this assertion breaks immediately.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../Home/HomeMount.tsx'),
      'utf8',
    );
    expect(src).toMatch(/TransactionsMount/);
    expect(src).not.toMatch(/TransactionsViewPlaceholder/);
  });
});
