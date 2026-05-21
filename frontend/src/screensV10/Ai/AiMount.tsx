// Phase 27-02 Task 3: AiMount — data fetcher + state machine + glue.
//
// Lifecycle:
//   1. On mount, parallel-ish: fetchObservation() (single GET — no other
//      blocking deps before the user can chat). On success, observation +
//      generated_at land in state; on failure, observationError surfaces
//      under the (still-rendered) chip list.
//   2. Composer / chip events flow into handleSend(text):
//        a. Append a user message bubble (`role:'user'`).
//        b. Append an empty AI bubble (`role:'ai'`) we'll fill via SSE.
//        c. Open AbortController + invoke streamChat() (Phase 18 v0.6 SSE).
//        d. Per-event:
//             token → append data to the AI bubble's text.
//             tool_start / tool_end / propose / tool_error → ignored here
//                 (V10 plan defers tool/proposal UI to Phase 28; the active
//                 state mirrors the v0.6 chat purely text-token-wise).
//             done → setStreaming(false).
//             error → write error sentinel into AI bubble + setStreaming(false).
//   3. handleChipTap delegates to handleSend (same path).
//   4. router.canPop / router.pop → onBack rendered as ← НАЗАД.
//
// Threat coverage:
//   - T-27-02-02 (DoS via chip-spam): handleSend early-returns when
//     isStreaming === true. New sends only allowed after onDone fires.
//   - T-27-02-04 (message duplication on rapid-tap): unique id =
//     `${role[0]}-${Date.now()}-${msgCounter++}` so React keys never collide
//     even on same-tick double-fires.
//   - Cleanup on unmount: AbortController abort() guarantees the in-flight
//     fetch is cancelled and no setState fires post-unmount.

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchObservation } from '../../api/v10';
import {
  streamChat,
  PRO_TIER_ERROR_MARKER,
  PRO_TIER_MESSAGE_RU,
} from '../../api/ai';
import type { AiStreamEvent } from '../../api/types';
import { usePosterRouter } from '../common';
import { AiView, type AiMessage } from './AiView';
import { todayRu, DEFAULT_SUGGESTION_CHIPS } from './computeAi';

export function AiMount() {
  const router = usePosterRouter();

  const [observation, setObservation] = useState<string | null>(null);
  const [observationGeneratedAt, setObservationGeneratedAt] = useState<
    Date | null
  >(null);
  const [observationLoading, setObservationLoading] = useState(true);
  const [observationError, setObservationError] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const idCounterRef = useRef(0);

  // ─────────── observation fetch ───────────
  useEffect(() => {
    let cancelled = false;
    setObservationLoading(true);
    setObservationError(null);
    fetchObservation()
      .then((res) => {
        if (cancelled) return;
        setObservation(res.text);
        setObservationGeneratedAt(new Date(res.generated_at));
      })
      .catch(() => {
        if (cancelled) return;
        setObservationError('Не удалось загрузить наблюдение');
      })
      .finally(() => {
        if (cancelled) return;
        setObservationLoading(false);
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  // ─────────── send / chip-tap ───────────
  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      idCounterRef.current += 1;
      const userId = `u-${Date.now()}-${idCounterRef.current}`;
      idCounterRef.current += 1;
      const aiId = `a-${Date.now()}-${idCounterRef.current}`;

      const userMsg: AiMessage = { role: 'user', text: trimmed, id: userId };
      const aiMsg: AiMessage = { role: 'ai', text: '', id: aiId };
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setInput('');
      setIsStreaming(true);

      let aiBuf = '';
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      streamChat(
        trimmed,
        (event: AiStreamEvent) => {
          if (event.type === 'token') {
            aiBuf += event.data;
            setMessages((prev) =>
              prev.map((m) => (m.id === aiId ? { ...m, text: aiBuf } : m)),
            );
          } else if (event.type === 'error') {
            // Phase 71 (UX-71): a 402 PRO_TIER_REQUIRED is a paywall, not a
            // generic failure. streamChat emits the opaque PRO_TIER_ERROR_MARKER
            // for that case — render fixed RU copy (no "⚠ Ошибка ответа:" prefix,
            // no server-detail interpolation; no-leak convention 67-03/67-05).
            const errText =
              event.data === PRO_TIER_ERROR_MARKER
                ? PRO_TIER_MESSAGE_RU
                : aiBuf || `⚠ Ошибка ответа: ${event.data}`;
            setMessages((prev) =>
              prev.map((m) => (m.id === aiId ? { ...m, text: errText } : m)),
            );
          }
          // tool_start / tool_end / propose / tool_error — ignored in V10 shell
          // (deferred to a future polish plan; v0.6 AiScreen renders these
          // via ToolUseIndicator/AiProposalSheet and we keep that surface only
          // in the v0.6 entry-point).
        },
        () => {
          setIsStreaming(false);
        },
        controller.signal,
      );
    },
    [isStreaming],
  );

  const handleChipTap = useCallback(
    (chip: string) => {
      handleSend(chip);
    },
    [handleSend],
  );

  return (
    <AiView
      observation={observation}
      observationGeneratedAt={observationGeneratedAt}
      observationLoading={observationLoading}
      observationError={observationError}
      suggestionChips={DEFAULT_SUGGESTION_CHIPS}
      messages={messages}
      isStreaming={isStreaming}
      input={input}
      onInputChange={setInput}
      onSend={handleSend}
      onChipTap={handleChipTap}
      canPop={router.canPop}
      onBack={() => router.pop()}
      todayLabel={todayRu(new Date())}
    />
  );
}
