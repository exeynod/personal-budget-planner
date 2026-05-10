// Phase 27-03: NewGoalSheet form tests (SAV-V10-03).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { NewGoalSheet } from '../NewGoalSheet';

afterEach(cleanup);

describe('NewGoalSheet', () => {
  it('renders inputs + buttons', () => {
    render(
      <NewGoalSheet
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    expect(screen.getByTestId('goal-name-input')).toBeTruthy();
    expect(screen.getByTestId('goal-target-input')).toBeTruthy();
    expect(screen.getByTestId('goal-due-input')).toBeTruthy();
    expect(screen.getByText('ОТМЕНА')).toBeTruthy();
    expect(screen.getByText('СОХРАНИТЬ')).toBeTruthy();
  });

  it('СОХРАНИТЬ disabled when name+target empty', () => {
    render(
      <NewGoalSheet
        onSave={vi.fn()}
        onClose={vi.fn()}
        submitting={false}
      />,
    );
    const saveBtn = screen.getByText('СОХРАНИТЬ') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('typing valid name+target enables СОХРАНИТЬ; click invokes onSave with cents conversion', () => {
    const onSave = vi.fn();
    render(
      <NewGoalSheet onSave={onSave} onClose={vi.fn()} submitting={false} />,
    );
    fireEvent.change(screen.getByTestId('goal-name-input'), {
      target: { value: 'iPhone' },
    });
    fireEvent.change(screen.getByTestId('goal-target-input'), {
      target: { value: '100000' },
    });
    const saveBtn = screen.getByText('СОХРАНИТЬ') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith({
      name: 'iPhone',
      target_cents: 100000 * 100, // rubles → cents
      due: null,
    });
  });

  it('passes due date when provided', () => {
    const onSave = vi.fn();
    render(
      <NewGoalSheet onSave={onSave} onClose={vi.fn()} submitting={false} />,
    );
    fireEvent.change(screen.getByTestId('goal-name-input'), {
      target: { value: 'iPhone' },
    });
    fireEvent.change(screen.getByTestId('goal-target-input'), {
      target: { value: '50000' },
    });
    fireEvent.change(screen.getByTestId('goal-due-input'), {
      target: { value: '2027-06-01' },
    });
    fireEvent.click(screen.getByText('СОХРАНИТЬ'));
    expect(onSave).toHaveBeenCalledWith({
      name: 'iPhone',
      target_cents: 5_000_000,
      due: '2027-06-01',
    });
  });

  it('strips non-digits from target input', () => {
    render(
      <NewGoalSheet onSave={vi.fn()} onClose={vi.fn()} submitting={false} />,
    );
    const input = screen.getByTestId('goal-target-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12abc34' } });
    expect(input.value).toBe('1234');
  });

  it('ОТМЕНА click invokes onClose', () => {
    const onClose = vi.fn();
    render(
      <NewGoalSheet onSave={vi.fn()} onClose={onClose} submitting={false} />,
    );
    fireEvent.click(screen.getByText('ОТМЕНА'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows СОХРАНЯЕМ… and disables button when submitting=true', () => {
    render(
      <NewGoalSheet onSave={vi.fn()} onClose={vi.fn()} submitting={true} />,
    );
    fireEvent.change(screen.getByTestId('goal-name-input'), {
      target: { value: 'iPhone' },
    });
    fireEvent.change(screen.getByTestId('goal-target-input'), {
      target: { value: '500' },
    });
    const btn = screen.getByText('СОХРАНЯЕМ…') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });
});
