// Phase 27-06 Task 2: SettingsView smoke tests — render, steppers, toggle,
// read-only AI cap, back link.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';

import { SettingsView, type SettingsViewProps } from '../SettingsView';

afterEach(cleanup);

function makeProps(overrides: Partial<SettingsViewProps> = {}): SettingsViewProps {
  return {
    cycle_start_day: 5,
    notify_days_before: 2,
    ai_categorization_enabled: true,
    ai_spend_cap_cents: 46500_00, // 46500 ₽
    loading: false,
    error: null,
    onChangeCycleDay: vi.fn(),
    onChangeNotifyDays: vi.fn(),
    onToggleAiCat: vi.fn(),
    canPop: true,
    onBack: vi.fn(),
    // Phase 30-07 (DEBT-08): Home background color picker.
    homeColor: 'coral',
    pickerOpen: false,
    onSelectHomeColor: vi.fn(),
    onTogglePicker: vi.fn(),
    // Phase 54-01 (LG-SW-02 web): Theme picker.
    theme: 'maximal_poster',
    themePickerOpen: false,
    onSelectTheme: vi.fn(),
    onToggleThemePicker: vi.fn(),
    ...overrides,
  };
}

describe('SettingsView — composition', () => {
  it('renders headline «Настройки.»', () => {
    render(<SettingsView {...makeProps()} />);
    expect(screen.getByText(/Настройки\./)).toBeInTheDocument();
  });

  it('renders SETTINGS eyebrow', () => {
    render(<SettingsView {...makeProps()} />);
    expect(screen.getByText(/SETTINGS/)).toBeInTheDocument();
  });

  it('renders all 4 form rows: cycle / notify / AI cat / AI cap', () => {
    render(<SettingsView {...makeProps()} />);
    expect(screen.getByText(/День начала цикла/)).toBeInTheDocument();
    expect(screen.getByText(/Напоминать за дней/)).toBeInTheDocument();
    expect(screen.getByText(/AI авто-категоризация/)).toBeInTheDocument();
    expect(screen.getByText(/AI лимит расходов/)).toBeInTheDocument();
  });

  it('cycle stepper + button calls onChangeCycleDay(current+1)', () => {
    const onChangeCycleDay = vi.fn();
    render(
      <SettingsView {...makeProps({ cycle_start_day: 5, onChangeCycleDay })} />,
    );
    fireEvent.click(screen.getByLabelText(/Увеличить день начала цикла/));
    expect(onChangeCycleDay).toHaveBeenCalledWith(6);
  });

  it('cycle stepper − button calls onChangeCycleDay(current−1)', () => {
    const onChangeCycleDay = vi.fn();
    render(
      <SettingsView {...makeProps({ cycle_start_day: 5, onChangeCycleDay })} />,
    );
    fireEvent.click(screen.getByLabelText(/Уменьшить день начала цикла/));
    expect(onChangeCycleDay).toHaveBeenCalledWith(4);
  });

  it('cycle stepper does NOT go below 1', () => {
    const onChangeCycleDay = vi.fn();
    render(
      <SettingsView {...makeProps({ cycle_start_day: 1, onChangeCycleDay })} />,
    );
    const minus = screen.getByLabelText(/Уменьшить день начала цикла/);
    expect(minus).toBeDisabled();
  });

  it('cycle stepper does NOT exceed 28', () => {
    const onChangeCycleDay = vi.fn();
    render(
      <SettingsView {...makeProps({ cycle_start_day: 28, onChangeCycleDay })} />,
    );
    const plus = screen.getByLabelText(/Увеличить день начала цикла/);
    expect(plus).toBeDisabled();
  });

  it('notify stepper + button calls onChangeNotifyDays(current+1)', () => {
    const onChangeNotifyDays = vi.fn();
    render(
      <SettingsView
        {...makeProps({ notify_days_before: 2, onChangeNotifyDays })}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Увеличить дни уведомления/));
    expect(onChangeNotifyDays).toHaveBeenCalledWith(3);
  });

  it('AI cat toggle calls onToggleAiCat(false) when checked', () => {
    const onToggleAiCat = vi.fn();
    render(
      <SettingsView
        {...makeProps({ ai_categorization_enabled: true, onToggleAiCat })}
      />,
    );
    fireEvent.click(screen.getByTestId('ai-cat-toggle'));
    expect(onToggleAiCat).toHaveBeenCalledWith(false);
  });

  it('AI cap displays in rubles (read-only)', () => {
    render(<SettingsView {...makeProps({ ai_spend_cap_cents: 12345_00 })} />);
    // 12345 ₽ formatted ru-RU
    expect(screen.getByTestId('ai-cap-value').textContent).toMatch(/12.345/);
  });

  it('error banner visible when error prop set', () => {
    render(<SettingsView {...makeProps({ error: 'Network down' })} />);
    expect(screen.getByText(/Network down/)).toBeInTheDocument();
  });

  it('back link visible when canPop=true', () => {
    const onBack = vi.fn();
    render(<SettingsView {...makeProps({ canPop: true, onBack })} />);
    fireEvent.click(screen.getByText(/← НАЗАД/));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
