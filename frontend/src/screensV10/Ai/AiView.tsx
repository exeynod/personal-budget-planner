// Phase 27-02 Task 2 GREEN: AiView — pure presentational component for the
// V10 AI screen. Surfaces AI-V10-01..02 (initial state with DM Serif
// observation + 4 chip-suggestions) + AI-V10-04..05 (active state with chat
// bubbles, typing indicator, composer with «↵ ОТПРАВИТЬ»).
//
// Router-agnostic: every interaction is exposed as a prop callback.
// AiMount (Task 3) wires `onSend`/`onChipTap` to streamChat() and
// `onBack` to router.pop().
//
// State machine (computed locally):
//   isInitial = messages.length === 0 && !isStreaming
//     → render observation block + chip list
//   else
//     → render scrollable message log + (optional) typing indicator
//
// Composer is always rendered at the bottom (sticky) regardless of state.
//
// Threat coverage:
//   - T-27-02-01: observation text rendered via React JSX → escaped.
//   - T-27-02-04: send is gated by `!props.input.trim()` here AND by
//                 `if (isStreaming) return` in AiMount.handleSend.

import { useEffect, useRef } from 'react';
import { Eyebrow, PosterButton } from '../../componentsV10';
import styles from './AiView.module.css';

export type AiMessage = { role: 'user' | 'ai'; text: string; id: string };

export interface AiViewProps {
  /** Server-rendered observation sentence (DM Serif Italic 36px). null while loading or on error. */
  observation: string | null;
  /** ISO date when the observation was generated server-side. Reserved for relative-time hints. */
  observationGeneratedAt: Date | null;
  /** True while GET /ai/observation is in flight on first mount. */
  observationLoading: boolean;
  /** Friendly error string when observation fetch failed (chips still render). */
  observationError: string | null;
  /** 4 prompt suggestions (DEFAULT_SUGGESTION_CHIPS). */
  suggestionChips: readonly string[];
  /** Conversation log (oldest → newest). Empty array == initial state. */
  messages: AiMessage[];
  /** True between user-send and SSE done event — drives typing indicator + disables re-send. */
  isStreaming: boolean;
  /** Composer text — controlled. */
  input: string;
  onInputChange: (s: string) => void;
  /** Send handler — receives the trimmed text. */
  onSend: (text: string) => void;
  /** Chip tap — receives the chip text (parent forwards to onSend). */
  onChipTap: (text: string) => void;
  /** True when PosterRouter has stack depth > 0 (AI screen pushed onto another). */
  canPop: boolean;
  onBack: () => void;
  /** Pre-formatted today label («9 мая») rendered in the «— из ваших данных, …» eyebrow. */
  todayLabel: string;
}

export function AiView(props: AiViewProps) {
  const {
    observation,
    observationLoading,
    observationError,
    suggestionChips,
    messages,
    isStreaming,
    input,
    onInputChange,
    onSend,
    onChipTap,
    canPop,
    onBack,
    todayLabel,
  } = props;

  const isInitial = messages.length === 0 && !isStreaming;
  const trimmedInput = input.trim();
  const sendDisabled = trimmedInput.length === 0 || isStreaming;

  // Auto-scroll to last message / typing indicator while streaming or on
  // any message append. Active state only — initial has no scroll log.
  const bottomRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!isInitial) {
      // jsdom (test env) doesn't implement scrollIntoView — guard with typeof.
      const node = bottomRef.current;
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, [messages, isStreaming, isInitial]);

  function handleSubmit() {
    if (sendDisabled) return;
    onSend(trimmedInput);
  }

  return (
    <div className={styles.root} data-testid="ai-view">
      {/* ─────────── header row ─────────── */}
      <header className={styles.headerRow}>
        {canPop ? (
          <button
            type="button"
            className={styles.back}
            onClick={onBack}
            aria-label="Назад"
          >
            ← НАЗАД
          </button>
        ) : (
          <span />
        )}
        <Eyebrow color="var(--poster-ink)">AI · ASSISTANT / ONLINE</Eyebrow>
      </header>

      {/* ─────────── body: initial vs active ─────────── */}
      {isInitial ? (
        <section className={styles.initial} data-testid="ai-initial">
          {observationLoading && (
            <div className={styles.observation} data-testid="obs-loading">
              …
            </div>
          )}
          {observation && !observationLoading && (
            <div className={styles.observation} data-testid="obs-text">
              {observation}
            </div>
          )}
          {observationError && (
            <div className={styles.obsError} data-testid="obs-error">
              {observationError}
            </div>
          )}
          <Eyebrow color="var(--poster-ink)">
            — из ваших данных, {todayLabel}
          </Eyebrow>

          <div className={styles.chipsHeader}>
            <Eyebrow color="var(--poster-ink)">ПОДСКАЗКИ · ТАПНИ</Eyebrow>
          </div>
          <ul className={styles.chips} data-testid="ai-chips">
            {suggestionChips.map((chip, i) => (
              <li key={i} className={styles.chipLi}>
                <button
                  type="button"
                  className={styles.chipRow}
                  onClick={() => onChipTap(chip)}
                  data-testid={`ai-chip-${i}`}
                >
                  <span className={styles.chipText}>{chip}</span>
                  <span className={styles.chipArrow}>→</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className={styles.active} data-testid="ai-active">
          <ol className={styles.messages}>
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.role === 'user' ? styles.msgUser : styles.msgAi
                }
                data-testid={`msg-${m.role}-${m.id}`}
              >
                {m.text}
              </li>
            ))}
            {isStreaming && (
              <li
                className={styles.typing}
                aria-label="typing"
                data-testid="typing"
              >
                <span className={`${styles.dot} poster-dot`} />
                <span className={`${styles.dot} poster-dot`} style={{ animationDelay: '0.15s' }} />
                <span className={`${styles.dot} poster-dot`} style={{ animationDelay: '0.3s' }} />
              </li>
            )}
            <li ref={bottomRef} className={styles.bottomAnchor} aria-hidden />
          </ol>
        </section>
      )}

      {/* ─────────── composer (sticky) ─────────── */}
      <footer className={styles.composer}>
        <input
          type="text"
          className={styles.composerInput}
          placeholder="напишите или тапните подсказку…"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          data-testid="ai-composer-input"
          disabled={isStreaming}
        />
        <PosterButton
          variant="primary"
          disabled={sendDisabled}
          onClick={handleSubmit}
        >
          ↵ ОТПРАВИТЬ
        </PosterButton>
      </footer>
    </div>
  );
}
