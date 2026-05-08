/**
 * AI Assistant экран — conversational chat с tool-use (AI-01..AI-04).
 *
 * - Liquid Glass MeshDark layout с floating accent send-кнопкой
 * - Empty state: orb hero + 4 suggestion chips (glass-dark)
 * - Streaming token-by-token через useAiConversation (AI-03)
 * - ToolUseIndicator во время вызова tool (AI-04)
 * - Auto-scroll при каждом токене
 * - Кнопка очистки истории
 */
import { useEffect, useRef, useState } from 'react';
import { Sparkle, Trash, CaretRight, PaperPlaneRight } from '@phosphor-icons/react';
import { ChatMessage } from '../components/ChatMessage';
import { MeshDarkBg } from '../components/MeshDarkBg';
import { ToolUseIndicator } from '../components/ToolUseIndicator';
import { AiProposalSheet } from '../components/AiProposalSheet';
import { useCategories } from '../hooks/useCategories';
import { usePeriods } from '../hooks/usePeriods';
import type { UseAiConversationResult } from '../hooks/useAiConversation';
import type { ChatMessageRead } from '../api/types';
import styles from './AiScreen.module.css';

export type AiScreenProps = UseAiConversationResult;

/** 4 фиксированных suggestion chips (CONTEXT.md decision). */
const SUGGESTION_CHIPS = [
  'Каков мой баланс?',
  'Где я перерасходовал?',
  'Сколько потратил на еду?',
  'Сделай прогноз',
];

export function AiScreen({
  messages,
  streaming,
  toolName,
  streamingText,
  error,
  proposal,
  sendMessage,
  clearHistory,
  dismissProposal,
}: AiScreenProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Prefetch categories + periods on screen mount so AiProposalSheet
  // opens instantly with the dropdowns ready — saves the perceptible
  // ~150-300 ms of round-trip latency when the user accepts a proposal.
  const { categories: prefetchedCategories } = useCategories(false);
  const { periods: prefetchedPeriods } = usePeriods();

  // Auto-scroll при новых токенах и сообщениях
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, toolName]);

  const autoGrow = (ta: HTMLTextAreaElement) => {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChipClick = (text: string) => {
    if (streaming) return;
    sendMessage(text);
  };

  const handleClear = async () => {
    if (streaming) return;
    await clearHistory();
  };

  const isEmpty = messages.length === 0 && !streaming;

  // Временное streaming-сообщение для отображения token-by-token
  const streamingMessage: ChatMessageRead | null =
    streaming && streamingText
      ? {
          id: -1,
          role: 'assistant',
          content: streamingText,
          tool_name: null,
          created_at: new Date().toISOString(),
        }
      : null;

  return (
    <div className={styles.wrap}>
      <MeshDarkBg />
      <div className={styles.scroll}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.headerTitle}>AI помощник</h2>
            <div className={styles.statusRow}>
              <span className={styles.statusDot} />
              онлайн · знает план и историю
            </div>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={handleClear}
              disabled={streaming}
              aria-label="Очистить историю"
            >
              <Trash size={16} weight="regular" />
            </button>
          )}
        </div>

        {/* Messages area */}
        <div className={styles.messages}>
          {isEmpty && (
            <div className={styles.empty}>
              <div className={styles.orbWrap}>
                <div className={styles.orbGlow} />
                <div className={styles.orbCore}>
                  <Sparkle size={38} weight="fill" color="#fff" />
                </div>
              </div>
              <h3 className={styles.emptyHeading}>Спроси что угодно</h3>
              <p className={styles.emptyHint}>
                Я отвечу из твоих данных или предложу записать новую трату
              </p>
              <div className={styles.chips}>
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={styles.chip}
                    onClick={() => handleChipClick(chip)}
                    disabled={streaming}
                  >
                    <div className={`glass-dark ${styles.chipInner}`}>
                      <span className={styles.chipText}>{chip}</span>
                      <span className={styles.chipChev}>
                        <CaretRight size={14} weight="bold" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* История сообщений. Defence-in-depth: backend уже фильтрует
              tool/empty assistant в /ai/history, но и тут отрезаем на случай
              десинхронизации схем. */}
          {messages
            .filter(
              (msg) =>
                (msg.role === 'user' || msg.role === 'assistant') &&
                (msg.content ?? '').trim() !== '',
            )
            .map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

          {/* Tool indicator — между user msg и AI response */}
          {streaming && toolName && (
            <ToolUseIndicator toolName={toolName} />
          )}

          {/* Streaming ответ AI token-by-token */}
          {streamingMessage && (
            <ChatMessage message={streamingMessage} isStreaming={true} />
          )}

          {/* Индикатор «думаю» если streaming без токенов */}
          {streaming && !streamingText && !toolName && (
            <ToolUseIndicator toolName={null} />
          )}

          {/* Error state */}
          {error && !streaming && (
            <div className={styles.error}>
              Ошибка: {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Floating input bar над таб-баром */}
      <div className={`glass-dark--high ${styles.inputBar}`}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Спроси о бюджете…"
          rows={1}
          disabled={streaming}
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={streaming || !input.trim()}
          aria-label="Отправить"
        >
          <PaperPlaneRight size={18} weight="fill" color="#fff" />
        </button>
      </div>

      {/* AI proposal review sheet */}
      <AiProposalSheet
        proposal={proposal}
        onClose={dismissProposal}
        prefetchedCategories={prefetchedCategories}
        prefetchedPeriods={prefetchedPeriods}
      />
    </div>
  );
}
