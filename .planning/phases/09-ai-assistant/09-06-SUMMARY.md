---
phase: 09-ai-assistant
plan: "06"
subsystem: ai-frontend-data-layer
tags: [react, typescript, sse, streaming, fetch, readablestream, hooks, css-modules]
dependency_graph:
  requires:
    - 09-05 (POST /api/v1/ai/chat SSE endpoint, GET /ai/history, DELETE /ai/conversation)
  provides:
    - frontend/src/api/types.ts — ChatMessageRead, AiStreamEvent, ChatHistoryResponse типы
    - frontend/src/api/ai.ts — streamChat(), getChatHistory(), clearConversation()
    - frontend/src/hooks/useAiConversation.ts — hook {messages, streaming, toolName, streamingText, error, sendMessage, clearHistory}
    - frontend/src/components/ChatMessage.tsx — user/assistant bubble с inline markdown
    - frontend/src/components/ToolUseIndicator.tsx — pulse-pill индикатор tool call
  affects:
    - 09-07 (AiScreen — использует useAiConversation, ChatMessage, ToolUseIndicator)
tech_stack:
  added: []
  patterns:
    - fetch + ReadableStream + TextDecoder для SSE (вместо EventSource — нужны custom headers)
    - cancelled flag pattern в useEffect (из useAnalytics.ts)
    - AbortController для отмены fetch при unmount
    - Оптимистичное добавление user message до получения ответа
    - Inline markdown parser без библиотек (bold, ul/ol)
    - CSS Modules с TG theme variables
key_files:
  created:
    - frontend/src/api/ai.ts
    - frontend/src/hooks/useAiConversation.ts
    - frontend/src/components/ChatMessage.tsx
    - frontend/src/components/ChatMessage.module.css
    - frontend/src/components/ToolUseIndicator.tsx
    - frontend/src/components/ToolUseIndicator.module.css
  modified:
    - frontend/src/api/types.ts
decisions:
  - "fetch+ReadableStream вместо EventSource — EventSource не поддерживает custom headers для X-Telegram-Init-Data"
  - "Inline markdown parser без библиотек — достаточно bold+ul/ol для ответов AI; библиотека в backlog"
  - "dangerouslySetInnerHTML только для assistant (T-09-16) — user input рендерится как plain text"
  - "streamingText как отдельное поле, не добавляется в messages — сохранение в messages только после done"
  - "getChatHistory после handleDone — получить реальные ID из БД вместо временных Date.now()"
metrics:
  duration: "~8 min"
  completed_date: "2026-05-06"
  tasks: 2
  files_created: 6
  files_modified: 1
---

# Phase 9 Plan 06: Frontend Data Layer для AI-чата Summary

**One-liner:** TypeScript типы, fetch+ReadableStream API клиент, useAiConversation hook с streaming state, ChatMessage bubble с inline markdown, ToolUseIndicator pulse-pill — полный data layer для AI-экрана.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | TypeScript типы + API клиент (types.ts + ai.ts) | 1a4d8a0 | frontend/src/api/types.ts, frontend/src/api/ai.ts |
| 2 | useAiConversation hook + ChatMessage + ToolUseIndicator | f194b0d | frontend/src/hooks/useAiConversation.ts, 4 component files |

## What Was Built

### Task 1: Типы и API клиент

**frontend/src/api/types.ts** — добавлен блок Phase 9:
- `AiRole` — `'user' | 'assistant' | 'tool'`
- `ChatMessageRead` — id, role, content, tool_name, created_at
- `ChatHistoryResponse` — `{ messages: ChatMessageRead[] }`
- `AiEventType` — `'token' | 'tool_start' | 'tool_end' | 'done' | 'error'`
- `AiStreamEvent` — `{ type: AiEventType; data: string }`

**frontend/src/api/ai.ts** — три экспорта:
- `getChatHistory()` — GET /ai/history через apiFetch
- `clearConversation()` — DELETE /ai/conversation через apiFetch
- `streamChat(message, onEvent, onDone, signal?)` — POST /ai/chat с fetch+ReadableStream:
  - X-Telegram-Init-Data заголовок через getInitDataRaw() + DEV fallback
  - TextDecoder + buffer splitting по `\n\n`
  - JSON parse каждого `data: {...}` chunk → AiStreamEvent callback
  - AbortError перехватывается без error callback

### Task 2: Hook и компоненты

**frontend/src/hooks/useAiConversation.ts:**
- useEffect с cancelled flag загружает историю при монтировании
- `sendMessage()` — оптимистичное добавление user message, запуск streamChat, accumulation токенов в `accumulatedText`; при done создаёт assistant message и обновляет историю из БД
- `clearHistory()` — clearConversation() + сброс локального state
- Возвращает: `{ messages, streaming, toolName, streamingText, error, sendMessage, clearHistory }`

**frontend/src/components/ChatMessage.tsx:**
- `.bubble.user` — align-self: flex-end, TG button color, border-bottom-right-radius: 4px
- `.bubble.assistant` — align-self: flex-start, TG secondary-bg color, border-bottom-left-radius: 4px
- User content — plain text `{content}` (защита T-09-16)
- Assistant content — `dangerouslySetInnerHTML` с parseMarkdown (bold `**`, li `-`, li `1.`)
- `isStreaming` пропс — мигающий курсор ▋

**frontend/src/components/ToolUseIndicator.tsx:**
- 3 pulse-dot с animation-delay 0/0.2/0.4s
- TOOL_LABELS map: get_period_balance → "Смотрю баланс...", get_category_summary → "Анализирую категории...", query_transactions → "Ищу транзакции...", get_forecast → "Считаю прогноз...", fallback → "Смотрю данные..."

## Deviations from Plan

None — план выполнен точно по спецификации.

## Threat Model Compliance

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-09-16 | Mitigated | dangerouslySetInnerHTML только для assistant; user → plain text через {content} |
| T-09-17 | Accepted | getInitDataRaw() — ответственность client.ts (Phase 1) |
| T-09-18 | Mitigated | AbortController при streaming; AbortError перехватывается без setState |

## Known Stubs

None — все компоненты имеют реальную логику. streamingText пробрасывается из хука для использования в AiScreen (Plan 09-07).

## Threat Flags

Нет новых security-relevant поверхностей — все угрозы учтены в threat model плана.

## Self-Check: PASSED

- [x] `frontend/src/api/types.ts` содержит AiStreamEvent, ChatMessageRead, AiRole
- [x] `frontend/src/api/ai.ts` содержит streamChat, getChatHistory, clearConversation
- [x] `grep "EventSource" frontend/src/api/ai.ts | wc -l` = 0 (не используется)
- [x] `grep "X-Telegram-Init-Data" frontend/src/api/ai.ts` — присутствует в headers
- [x] `frontend/src/hooks/useAiConversation.ts` содержит cancelled flag, toolName, streamingText
- [x] `frontend/src/components/ChatMessage.tsx` содержит parseMarkdown, dangerouslySetInnerHTML (только assistant)
- [x] `frontend/src/components/ToolUseIndicator.tsx` содержит pulse анимацию, #a78bfa
- [x] TypeScript компиляция без ошибок (tsc --noEmit 0 errors)
- [x] Commits 1a4d8a0, f194b0d присутствуют в git log
