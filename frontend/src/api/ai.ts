/**
 * AI Assistant API client (AI-03, AI-06).
 *
 * streamChat() использует fetch + ReadableStream (не EventSource) —
 * для поддержки custom headers X-Telegram-Init-Data (AI-09).
 */
import { apiFetch, getInitDataRaw } from './client';
import type { AiStreamEvent, AiSuggestResponse, ChatHistoryResponse } from './types';

/**
 * Phase 71 (UX-71, web parity with iOS AI-CHAT-2): sentinel emitted on the
 * `{type:'error'}` SSE event when POST /ai/chat returns 402 PRO_TIER_REQUIRED.
 *
 * The chat endpoint is a Pro-tier feature; a free-tier user gets a 402 with
 * body `{"detail":{"error":"PRO_TIER_REQUIRED",...}}`. Rather than leaking the
 * raw `HTTP 402` (or the server `detail` string) into the UI, streamChat emits
 * this opaque marker so the view layer can render a fixed, no-leak RU paywall
 * message (mirrors iOS `APIError.isProTierRequired` → `proTierFacingRu`).
 */
export const PRO_TIER_ERROR_MARKER = 'PRO_TIER_REQUIRED';

/**
 * Fixed RU copy shown when the chat hits the Pro-tier paywall. Matches the iOS
 * `APIError.proTierFacingRu` string exactly. Fixed copy — never interpolate the
 * server `detail` (no-leak convention, 67-03/67-05).
 */
export const PRO_TIER_MESSAGE_RU = 'Чат-ассистент доступен в Pro-тарифе';

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
        // Phase 71 (UX-71): a 402 on the chat stream is the require_pro
        // paywall (body `{"detail":{"error":"PRO_TIER_REQUIRED",...}}`). Detect
        // it via the status code AND (belt-and-braces) the typed marker in the
        // body, then emit the opaque PRO_TIER_ERROR_MARKER so the view renders
        // fixed paywall copy instead of the raw "HTTP 402". The 402 body must
        // be drained off-stream (res.body may be present on a 402); guard the
        // read so a non-JSON / empty body still classifies via the status code.
        let isProTier = res.status === 402;
        if (res.status === 402) {
          try {
            const text = await res.text();
            const parsed = JSON.parse(text) as {
              detail?: { error?: string };
            } | null;
            if (parsed?.detail?.error === 'PRO_TIER_REQUIRED') {
              isProTier = true;
            }
          } catch {
            // Non-JSON / empty 402 body — status code alone classifies it.
          }
        }
        onEvent({
          type: 'error',
          data: isProTier ? PRO_TIER_ERROR_MARKER : `HTTP ${res.status}`,
        });
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
