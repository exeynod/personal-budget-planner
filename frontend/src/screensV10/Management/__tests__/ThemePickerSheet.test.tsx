import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemePickerSheet } from '../ThemePickerSheet';

afterEach(cleanup);

describe('ThemePickerSheet', () => {
  it('renders 2 theme options when open', () => {
    render(
      <ThemePickerSheet
        isOpen={true}
        current="maximal_poster"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('theme-maximal_poster')).toBeInTheDocument();
    expect(screen.getByTestId('theme-liquid_glass')).toBeInTheDocument();
    expect(screen.queryByTestId('theme-ios_default')).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('marks current theme as aria-checked', () => {
    render(
      <ThemePickerSheet
        isOpen={true}
        current="liquid_glass"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('theme-liquid_glass')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('theme-maximal_poster')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('calls onSelect + onClose on tap', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ThemePickerSheet
        isOpen={true}
        current="maximal_poster"
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('theme-liquid_glass'));
    expect(onSelect).toHaveBeenCalledWith('liquid_glass');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ThemePickerSheet
        isOpen={false}
        current="maximal_poster"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
