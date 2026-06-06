// Phase 31 (code-quality): StatePlate — the parameterised loading / error plate
// extracted from the Mount components. Asserts the variant markup, retry / back
// wiring, testId pass-through, and that colours come from props (so the Liquid
// Glass ink-var routing is preserved, never a hardcoded paper-on-light plate).

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { StatePlate } from '../StatePlate';

afterEach(cleanup);

describe('StatePlate', () => {
  it('renders the loading variant with the ЗАГРУЗКА eyebrow', () => {
    render(<StatePlate variant="loading" testId="x-loading" />);
    const plate = screen.getByTestId('x-loading');
    expect(plate).toBeTruthy();
    expect(plate.textContent).toContain('ЗАГРУЗКА');
    // No retry button on a loading plate.
    expect(screen.queryByText('ПОВТОРИТЬ')).toBeNull();
  });

  it('renders the error variant with message + retry, firing onRetry', () => {
    const onRetry = vi.fn();
    render(
      <StatePlate
        variant="error"
        testId="x-error"
        message="Сломалось"
        onRetry={onRetry}
      />,
    );
    const plate = screen.getByTestId('x-error');
    expect(plate.textContent).toContain('ОШИБКА');
    expect(plate.textContent).toContain('Сломалось');
    fireEvent.click(screen.getByText('ПОВТОРИТЬ'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders a НАЗАД ghost button when onBack is provided', () => {
    const onBack = vi.fn();
    render(
      <StatePlate
        variant="error"
        message="x"
        onRetry={() => {}}
        onBack={onBack}
      />,
    );
    fireEvent.click(screen.getByText('НАЗАД'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('routes colours through the passed CSS values (no hardcoded paper-on-light)', () => {
    render(
      <StatePlate
        variant="loading"
        testId="x-themed"
        background="var(--color-home, var(--poster-coral))"
        color="var(--ink-on-home)"
        eyebrowColor="var(--eyebrow-ink)"
      />,
    );
    const plate = screen.getByTestId('x-themed') as HTMLElement;
    // Background + ink come from the ink vars, not a literal light surface.
    expect(plate.style.background).toContain('--color-home');
    expect(plate.style.color).toContain('--ink-on-home');
  });

  it('defaults to the cobalt drill-down surface when no colours passed', () => {
    render(<StatePlate variant="loading" testId="x-default" />);
    const plate = screen.getByTestId('x-default') as HTMLElement;
    expect(plate.style.background).toContain('--poster-cobalt');
    expect(plate.style.color).toContain('--poster-paper');
  });
});
