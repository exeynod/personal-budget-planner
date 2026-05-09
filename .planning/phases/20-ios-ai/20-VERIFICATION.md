---
phase: 20
status: human_needed
date: 2026-05-09
---

# Phase 20 Verification: iOS AI

## Code Status — все компилируется

**BUILD SUCCEEDED** на iPhone 17 Pro Simulator со всеми новыми файлами:
- `Networking/SSEClient.swift` — AsyncThrowingStream<SSEEvent> через URLSession.bytes(for:);
  парсит "data: {...}" → SSEEvent enum (messageDelta, messageComplete, toolCall,
  toolResult, propose, usage, error, done). AIChatAPI.stream + AIHistoryAPI (history/clear).
- `Features/AI/AIChatView.swift` — AIChatViewModel (@Observable) + ScrollViewReader для
  auto-scroll + composer с TextField/send button + history menu (clear). Поддерживает
  Bearer auth через тот же APIClient.
- `Features/AI/AIProposalSheet.swift` — bottom-sheet с pre-filled полями (amount/category/
  date/description), кнопки Сохранить/Отмена. На confirm — POST /actual или /planned.

BottomNav: вкладка AI теперь NavigationStack { AIChatView() } вместо ComingSoon.

## Refresh без регрессии

Home продолжает работать после Phase 20 changes (скриншот баланс 239 292 ₽, top-3 категории).

## Acceptance per REQ

| REQ | Status |
|---|---|
| IOS-05 (SSE client) | ✓ code (AsyncThrowingStream + line parser) |
| IOSAI-01 (Chat streaming) | ✓ code, ⏳ manual UAT |
| IOSAI-02 (Proposal sheet) | ✓ code, ⏳ manual UAT |

## Human UAT Required

1. **AI tab → AIChatView:** показывает историю чата (через GET /ai/history).
2. **Send message:** ввести текст, тап send → POST /ai/chat → SSE-стрим начинается;
   текст ассистента печатается посимвольно с курсором "▌".
3. **Tool call:** "Сколько на еду в марте?" → AI вызывает get_period_balance →
   bubble "Использую: get_period_balance" с pulse-индикатором (упрощённо — текст).
4. **Proposal flow:** "Записал 500 на кофе" → AI вызывает propose_actual_transaction →
   AIProposalSheet открывается с pre-filled (500₽, категория Кафе, today, описание) →
   "Сохранить" → POST /actual → транзакция в History.
5. **Clear history:** Menu (•••) → "Очистить историю" → DELETE /ai/conversation.
6. **Rate limit (429):** при превышении лимита — error message с Retry-After.
