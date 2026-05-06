/**
 * AI Assistant API client (AI-03, AI-06).
 *
 * streamChat() использует fetch + ReadableStream (не EventSource) —
 * для поддержки custom headers X-Telegram-Init-Data (AI-09).
 */
import { apiFetch, getInitDataRaw } from './client';
import type { AiStreamEvent, AiSuggestResponse, ChatHistoryResponse } from './types';

/**
 * Предложить категорию по описанию транзакции (AICAT-02).
 *
 * GET /api/v1/ai/suggest-category?q=<text>
 * Возвращает category_id, name, confidence — наиболее похожую категорию.
 */
export async function suggestCategory(q: string): Promise<AiSuggestResponse> {
  return apiFetch<AiSuggestResponse>('/ai/suggest-category?q=' + encodeURIComponent(q));
}

/**
 * Получить историю AI разговора (AI-06).
 */
export async function getChatHistory(): Promise<ChatHistoryResponse> {
  return apiFetch<ChatHistoryResponse>('/ai/history');
}

/**
 * Очистить историю AI разговора (AI-06).
 */
export async function clearConversation(): Promise<void> {
  return apiFetch<void>('/ai/conversation', { method: 'DELETE' });
}

/**
 * Отправить сообщение и стримить ответ через fetch + ReadableStream (AI-03).
 *
 * Использует X-Telegram-Init-Data заголовок (не EventSource — не поддерживает headers).
 * Парсит SSE: "data: {...}\n\n" → AiStreamEvent объекты.
 */
export function streamChat(
  message: string,
  onEvent: (event: AiStreamEvent) => void,
  onDone: () => void,
  signal?: AbortSignal,
): void {
  const initDataRaw = getInitDataRaw();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (initDataRaw) {
    headers['X-Telegram-Init-Data'] = initDataRaw;
  } else if (import.meta.env.DEV) {
    headers['X-Telegram-Init-Data'] = 'dev-mode-stub';
  }

  fetch('/api/v1/ai/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ message }),
    signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        onEvent({ type: 'error', data: `HTTP ${res.status}` });
        onDone();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.trim();
            if (line.startsWith('data: ')) {
              try {
                const payload = JSON.parse(line.slice(6)) as AiStreamEvent;
                onEvent(payload);
              } catch {
                // Игнорируем некорректный JSON chunk
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      onDone();
    })
    .catch((err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      onEvent({ type: 'error', data: err instanceof Error ? err.message : String(err) });
      onDone();
    });
}
