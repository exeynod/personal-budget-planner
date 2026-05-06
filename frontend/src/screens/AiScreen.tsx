/**
 * AI Assistant экран — conversational chat с tool-use (AI-01..AI-04).
 *
 * - PageTitle "Budget AI" + Sparkle аватар (AI-01)
 * - 4 suggestion chips при пустой истории (AI-02)
 * - Streaming token-by-token через useAiConversation (AI-03)
 * - ToolUseIndicator во время вызова tool (AI-04)
 * - Auto-scroll при каждом токене
 * - Кнопка очистки истории
 */
import { useEffect, useRef, useState } from 'react';
import { Sparkle, Trash } from '@phosphor-icons/react';
import { ChatMessage } from '../components/ChatMessage';
import { PageTitle } from '../components/PageTitle';
import { ToolUseIndicator } from '../components/ToolUseIndicator';
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
  sendMessage,
  clearHistory,
}: AiScreenProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll при новых токенах и сообщениях
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, toolName]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setInput('');
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
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <PageTitle title="Budget AI" />
        {messages.length > 0 && (
          <button
            className={styles.clearBtn}
            onClick={handleClear}
            disabled={streaming}
            aria-label="Очистить историю"
          >
            <Trash size={20} weight="regular" />
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className={`${styles.messages} ${isEmpty ? styles.messagesEmpty : ''}`}>
        {/* Empty state с suggestion chips */}
        {isEmpty && (
          <div className={styles.emptyState}>
            <Sparkle size={48} weight="thin" color="#a78bfa" />
            <div className={styles.emptyHeading}>Задай вопрос о своём бюджете</div>
            <div className={styles.chips}>
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip}
                  className={styles.chip}
                  onClick={() => handleChipClick(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* История сообщений. Defence-in-depth: backend уже фильтрует
            tool/empty assistant в /ai/history, но и тут отрезаем на случай
            десинхронизации схем — иначе пустой content рисуется как
            «пустой bubble» рядом с реальным сообщением. */}
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

        {/* Индикатор загрузки если streaming без токенов ещё */}
        {streaming && !streamingText && !toolName && (
          <div className={styles.thinking}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        )}

        {/* Error state */}
        {error && !streaming && (
          <div className={styles.error}>
            Ошибка: {error}
          </div>
        )}

        {/* Anchor для auto-scroll */}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className={styles.inputBar}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Спроси о бюджете..."
          rows={1}
          disabled={streaming}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={streaming || !input.trim()}
          aria-label="Отправить"
        >
          <Sparkle size={20} weight="fill" color={streaming || !input.trim() ? '#999' : '#a78bfa'} />
        </button>
      </div>
    </div>
  );
}
