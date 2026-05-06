/**
 * Bubble компонент для сообщений AI чата (AI-03).
 *
 * Поддерживает роли: user (правый), assistant (левый).
 * Inline markdown: **bold**, - списки, 1. нумерованные списки.
 * Используется для финальных сообщений и streaming-preview.
 *
 * Безопасность (T-09-16): dangerouslySetInnerHTML только для assistant
 * (LLM-контент); user input рендерится как plain text.
 */
import type { ChatMessageRead } from '../api/types';
import styles from './ChatMessage.module.css';

interface Props {
  message: ChatMessageRead;
  isStreaming?: boolean;
}

/** Простой inline markdown парсер (bold, ul, ol) без библиотек. */
function parseMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
}

export function ChatMessage({ message, isStreaming = false }: Props) {
  const isUser = message.role === 'user';
  const content = message.content ?? '';

  return (
    <div className={`${styles.bubble} ${isUser ? styles.user : styles.assistant}`}>
      {isUser ? (
        <p className={styles.text}>{content}</p>
      ) : (
        <p
          className={styles.text}
          dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
        />
      )}
      {isStreaming && <span className={styles.cursor}>&#9611;</span>}
    </div>
  );
}
