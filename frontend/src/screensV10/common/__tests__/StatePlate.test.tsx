// StatePlate — the parameterised loading / error plate shared by the Mount
// components. Asserts the variant markup, retry / back wiring, testId
// pass-through, and that colours come from props (so a caller can route its own
// screen ink through the plate). Native Liquid Glass styling.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { StatePlate } from '../StatePlate';

afterEach(cleanup);

describe('StatePlate', () => {
  it('renders the loading variant with the Загрузка eyebrow', () => {
    render(<StatePlate variant="loading" testId="x-loading" />);
    const plate = screen.getByTestId('x-loading');
    expect(plate).toBeTruthy();
    expect(plate.textContent).toContain('Загрузка');
    // No retry button on a loading plate.
    expect(screen.queryByText('Повторить')).toBeNull();
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
    expect(plate.textContent).toContain('Ошибка');
    expect(plate.textContent).toContain('Сломалось');
    fireEvent.click(screen.getByText('Повторить'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders a Назад ghost button when onBack is provided', () => {
    const onBack = vi.fn();
    render(
      <StatePlate
        variant="error"
        message="x"
        onRetry={() => {}}
        onBack={onBack}
      />,
    );
    fireEvent.click(screen.getByText('Назад'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('routes colours through the passed CSS values', () => {
    render(
      <StatePlate
        variant="loading"
        testId="x-themed"
        background="var(--color-home, var(--lgn-bg))"
        color="var(--ink-on-home)"
        eyebrowColor="var(--lgn-ink-2)"
      />,
    );
    const plate = screen.getByTestId('x-themed') as HTMLElement;
    expect(plate.style.background).toContain('--color-home');
    expect(plate.style.color).toContain('--ink-on-home');
  });

  it('defaults to the native grouped surface when no colours passed', () => {
    render(<StatePlate variant="loading" testId="x-default" />);
    const plate = screen.getByTestId('x-default') as HTMLElement;
    expect(plate.style.background).toContain('--lgn-bg');
    expect(plate.style.color).toContain('--lgn-ink');
  });
});
