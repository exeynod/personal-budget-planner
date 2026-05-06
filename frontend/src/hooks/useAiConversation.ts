/**
 * Hook для управления AI разговором (AI-03, AI-04, AI-06).
 *
 * Загружает историю при монтировании.
 * sendMessage() стримит ответ token-by-token через streamChat().
 * clearHistory() удаляет все сообщения.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearConversation, getChatHistory, streamChat } from '../api/ai';
import type {
  AiStreamEvent,
  ChatMessageRead,
  ProposalPayload,
} from '../api/types';

export interface UseAiConversationResult {
  messages: ChatMessageRead[];
  streaming: boolean;
  toolName: string | null;  // имя активного tool (для ToolUseIndicator)
  streamingText: string;    // частичный текст ответа AI во время стриминга
  error: string | null;
  proposal: ProposalPayload | null; // pending bottom-sheet from AI
  sendMessage: (text: string) => void;
  clearHistory: () => Promise<void>;
  dismissProposal: () => void;
}

export function useAiConversation(): UseAiConversationResult {
  const [messages, setMessages] = useState<ChatMessageRead[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [toolName, setToolName] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalPayload | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Загрузить историю при монтировании (cancelled flag pattern)
  useEffect(() => {
    let cancelled = false;
    getChatHistory()
      .then((data) => {
        if (!cancelled) setMessages(data.messages);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (streaming) return;

    // Добавить user message локально (оптимистичное обновление)
    const userMsg: ChatMessageRead = {
      id: Date.now(),
      role: 'user',
      content: text,
      tool_name: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamingText('');
    setToolName(null);
    setError(null);

    const abort = new AbortController();
    abortRef.current = abort;

    let accumulatedText = '';

    const handleEvent = (event: AiStreamEvent) => {
      if (event.type === 'token') {
        accumulatedText += event.data;
        setStreamingText(accumulatedText);
      } else if (event.type === 'tool_start') {
        setToolName(event.data);
      } else if (event.type === 'tool_end') {
        setToolName(null);
      } else if (event.type === 'propose') {
        // AI prepared an actual/planned txn — surface the bottom sheet
        // for user review. Last one wins if AI proposes more in a row.
        setProposal(event.data);
      } else if (event.type === 'error') {
        setError(event.data);
      }
    };

    const handleDone = () => {
      setStreaming(false);
      setToolName(null);
      if (accumulatedText) {
        const assistantMsg: ChatMessageRead = {
          id: Date.now() + 1,
          role: 'assistant',
          content: accumulatedText,
          tool_name: null,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
      setStreamingText('');
      // Обновить историю из БД (получить реальные ID)
      getChatHistory()
        .then((data) => setMessages(data.messages))
        .catch(() => {/* оставить локальные данные */});
    };

    streamChat(text, handleEvent, handleDone, abort.signal);
  }, [streaming]);

  const clearHistory = useCallback(async () => {
    await clearConversation();
    setMessages([]);
    setStreamingText('');
    setError(null);
    setProposal(null);
  }, []);

  const dismissProposal = useCallback(() => {
    setProposal(null);
  }, []);

  return {
    messages,
    streaming,
    toolName,
    streamingText,
    error,
    proposal,
    sendMessage,
    clearHistory,
    dismissProposal,
  };
}
