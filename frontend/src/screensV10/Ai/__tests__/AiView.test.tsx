// Phase 27-02 Task 2: AiView presentational component tests.
//
// Coverage (AI-V10-01..02 + AI-V10-04..05 surfaces):
//   - Initial state: eyebrow «AI · ASSISTANT / ONLINE» + observation + 4 chips.
//   - Observation loading state replaces text with «…».
//   - Observation error renders the error sub-line.
//   - Chip tap → onChipTap(chipText).
//   - Active state: messages render with role-specific data-testid.
//   - Typing indicator visible when isStreaming=true.
//   - Composer send button disabled when input empty.
//   - Composer send button invokes onSend(input.trim()).
//   - ← НАЗАД button rendered when canPop=true → onBack().
//
// Pure presentational — no router, no fetch — so we render directly.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { AiView, type AiMessage, type AiViewProps } from '../AiView';

afterEach(cleanup);

const baseProps: AiViewProps = {
  observation: 'Май в плюсе на 12 345 ₽',
  observationGeneratedAt: new Date(2026, 4, 9, 12, 0, 0),
  observationLoading: false,
  observationError: null,
  suggestionChips: [
    'Сколько я потратил на кафе в мае?',
    'Покажи топ-3 категории за неделю',
    'Создай регулярный платёж 1490 ₽ Wildberries 5 числа',
    'Куда уходят деньги в этом месяце?',
  ] as readonly string[],
  messages: [] as AiMessage[],
  isStreaming: false,
  input: '',
  onInputChange: vi.fn(),
  onSend: vi.fn(),
  onChipTap: vi.fn(),
  canPop: false,
  onBack: vi.fn(),
  todayLabel: '9 мая',
};

function renderAi(overrides: Partial<typeof baseProps> = {}) {
  const props = { ...baseProps, ...overrides };
  // Re-stub spies per render so call-counts isolate cleanly.
  const onChipTap = vi.fn();
  const onSend = vi.fn();
  const onInputChange = vi.fn();
  const onBack = vi.fn();
  const utils = render(
    <AiView
      {...props}
      onChipTap={onChipTap}
      onSend={onSend}
      onInputChange={onInputChange}
      onBack={onBack}
    />,
  );
  return { ...utils, onChipTap, onSend, onInputChange, onBack };
}

describe('AiView — initial state', () => {
  it('renders «AI · ASSISTANT / ONLINE» eyebrow', () => {
    const { getByText } = renderAi();
    expect(getByText('AI · ASSISTANT / ONLINE')).toBeInTheDocument();
  });

  it('renders the observation text and today eyebrow', () => {
    const { getByText, getByTestId } = renderAi();
    expect(getByTestId('obs-text')).toHaveTextContent('Май в плюсе на 12 345 ₽');
    expect(getByText(/из ваших данных, 9 мая/)).toBeInTheDocument();
  });

  it('renders 4 chip rows when chat is empty', () => {
    const { getAllByTestId } = renderAi();
    const chips = getAllByTestId(/^ai-chip-/);
    expect(chips).toHaveLength(4);
  });

  it('shows loading placeholder when observationLoading=true', () => {
    const { getByTestId, queryByTestId } = renderAi({
      observation: null,
      observationLoading: true,
    });
    expect(getByTestId('obs-loading')).toBeInTheDocument();
    expect(queryByTestId('obs-text')).toBeNull();
    // chips still visible
    expect(getByTestId('ai-chip-0')).toBeInTheDocument();
  });

  it('renders observation error text when observationError set', () => {
    const { getByTestId } = renderAi({
      observation: null,
      observationError: 'Не удалось загрузить наблюдение',
    });
    expect(getByTestId('obs-error')).toHaveTextContent(
      'Не удалось загрузить наблюдение',
    );
  });

  it('chip tap invokes onChipTap with chip text', () => {
    const { getByTestId, onChipTap } = renderAi();
    fireEvent.click(getByTestId('ai-chip-2'));
    expect(onChipTap).toHaveBeenCalledTimes(1);
    expect(onChipTap).toHaveBeenCalledWith(
      'Создай регулярный платёж 1490 ₽ Wildberries 5 числа',
    );
  });
});

describe('AiView — active state', () => {
  it('renders user + ai messages when messages array non-empty', () => {
    const messages: AiMessage[] = [
      { role: 'user', text: 'привет', id: 'u-1' },
      { role: 'ai', text: 'здравствуйте', id: 'a-1' },
    ];
    const { getByTestId, queryByTestId } = renderAi({ messages });
    // active section visible, initial section gone
    expect(getByTestId('ai-active')).toBeInTheDocument();
    expect(queryByTestId('ai-initial')).toBeNull();
    expect(getByTestId('msg-user-u-1')).toHaveTextContent('привет');
    expect(getByTestId('msg-ai-a-1')).toHaveTextContent('здравствуйте');
  });

  it('renders typing indicator when isStreaming=true', () => {
    const messages: AiMessage[] = [
      { role: 'user', text: 'привет', id: 'u-1' },
    ];
    const { getByTestId, getByLabelText } = renderAi({
      messages,
      isStreaming: true,
    });
    expect(getByTestId('typing')).toBeInTheDocument();
    expect(getByLabelText('typing')).toBeInTheDocument();
  });
});

describe('AiView — composer', () => {
  it('disables ОТПРАВИТЬ button when input is empty', () => {
    const { getByText } = renderAi({ input: '' });
    const btn = getByText(/ОТПРАВИТЬ/).closest('button');
    expect(btn).not.toBeNull();
    expect(btn).toBeDisabled();
  });

  it('invokes onSend with trimmed input when button clicked', () => {
    const { getByText, onSend } = renderAi({ input: '  привет  ' });
    fireEvent.click(getByText(/ОТПРАВИТЬ/));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('привет');
  });
});

describe('AiView — back button', () => {
  it('does not render ← НАЗАД when canPop=false', () => {
    const { queryByText } = renderAi({ canPop: false });
    expect(queryByText('← НАЗАД')).toBeNull();
  });

  it('renders ← НАЗАД and invokes onBack when clicked', () => {
    const { getByText, onBack } = renderAi({ canPop: true });
    fireEvent.click(getByText('← НАЗАД'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
