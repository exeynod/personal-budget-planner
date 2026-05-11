import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { GlassCard } from '../GlassCard';

afterEach(() => {
  cleanup();
});

describe('GlassCard', () => {
  it('renders children', () => {
    render(<GlassCard><span data-testid="kid">hello</span></GlassCard>);
    expect(screen.getByTestId('kid')).toBeInTheDocument();
  });

  it('applies material class by prop', () => {
    const { container } = render(<GlassCard material="thick">x</GlassCard>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/material-thick/);
  });

  it('applies elevation class by prop', () => {
    const { container } = render(<GlassCard elevation="floating-strong">x</GlassCard>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/elevation-floating-strong/);
  });

  it('renders as button когда onClick provided', () => {
    const onClick = vi.fn();
    render(<GlassCard onClick={onClick}>tap</GlassCard>);
    const root = screen.getByTestId('glass-card');
    expect(root).toHaveAttribute('role', 'button');
    fireEvent.click(root);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('skips inner border when prop=false', () => {
    const { container } = render(<GlassCard innerBorder={false}>x</GlassCard>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).not.toMatch(/withBorder/);
  });

  it('overrides radius via prop', () => {
    const { container } = render(<GlassCard radius={28}>x</GlassCard>);
    const root = container.firstChild as HTMLElement;
    expect(root.style.borderRadius).toBe('28px');
  });
});
