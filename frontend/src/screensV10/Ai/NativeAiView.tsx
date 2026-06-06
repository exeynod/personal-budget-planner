// Liquid Glass v2 — native iOS AI view.
//
// Faithful native port of the poster AiView (screensV10/Ai/AiView.tsx). Mirrors
// the SAME props and the SAME UX — no invented controls, no dropped ones:
//   - tab-root large title «AI» (NativeLargeTitle) when useNavLevel().isRoot,
//     else a back nav-bar (NativeNavBar) for the pushed case;
//   - INITIAL state (no messages, not streaming): white grouped «observation»
//     hero card (loading «…» / text / error) + a «Подсказки» inset-grouped list
//     of tappable chip rows (chevron) driving onChipTap;
//   - ACTIVE state: scrollable message log of user (accent bubble) / ai (card
//     bubble) messages + a 3-dot typing indicator while streaming;
//   - sticky bottom composer: rounded input + round accent send button
//     (disabled when input empty or while streaming), Enter-to-send.
//
// Pure presentational — AiMount wires onSend/onChipTap to streamChat() and
// onBack to router.pop() exactly as it does for the poster view. No data logic
// is duplicated here.
//
// NOTE: the poster AiView has no AI spend/cap surface (no such prop on
// AiViewProps), so none is rendered — mirroring the existing UX exactly.

import { memo, useEffect, useRef } from 'react';
import { ArrowUp } from '@phosphor-icons/react';
import {
  NativeLargeTitle,
  NativeNavBar,
  SectionHeader,
  InsetGroup,
  InsetRow,
} from '../native/NativePrimitives';
import { useNavLevel } from '../native/NavLevel';
import type { AiViewProps } from './AiView';
import styles from './NativeAiView.module.css';

function NativeAiViewInner(props: AiViewProps) {
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
    onBack,
    todayLabel,
  } = props;

  // Tab-root (large title, no back) vs pushed (back chevron). The shell marks
  // tab destinations via NavLevelProvider isRoot.
  const { isRoot } = useNavLevel();

  const isInitial = messages.length === 0 && !isStreaming;
  const trimmedInput = input.trim();
  const sendDisabled = trimmedInput.length === 0 || isStreaming;

  // Auto-scroll to the last message / typing indicator (active state only).
  const bottomRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!isInitial) {
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
      {isRoot ? (
        <NativeLargeTitle title="AI" />
      ) : (
        <NativeNavBar title="AI" onBack={onBack} />
      )}

      <div className={styles.body}>
        {isInitial ? (
          <section className={styles.initial} data-testid="ai-initial">
            {/* Observation hero — white grouped card. */}
            <div className={styles.obsCard}>
              {observationLoading && (
                <div className={styles.obsText} data-testid="obs-loading">
                  …
                </div>
              )}
              {observation && !observationLoading && (
                <div className={styles.obsText} data-testid="obs-text">
                  {observation}
                </div>
              )}
              {observationError && (
                <div className={styles.obsError} data-testid="obs-error">
                  {observationError}
                </div>
              )}
              <div className={styles.obsMeta}>
                из ваших данных, {todayLabel}
              </div>
            </div>

            <SectionHeader>Подсказки</SectionHeader>
            <InsetGroup>
              {suggestionChips.map((chip, i) => (
                <InsetRow
                  key={i}
                  testId={`ai-chip-${i}`}
                  title={<span className={styles.chipText}>{chip}</span>}
                  chevron
                  onClick={() => onChipTap(chip)}
                />
              ))}
            </InsetGroup>
          </section>
        ) : (
          <section className={styles.active} data-testid="ai-active">
            <ol className={styles.messages}>
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={m.role === 'user' ? styles.msgUser : styles.msgAi}
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
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                </li>
              )}
              <li ref={bottomRef} className={styles.bottomAnchor} aria-hidden />
            </ol>
          </section>
        )}
      </div>

      {/* Sticky bottom composer — rounded input + round accent send button. */}
      <footer className={styles.composer}>
        <input
          type="text"
          className={styles.composerInput}
          placeholder="Напишите или тапните подсказку…"
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
        <button
          type="button"
          className={styles.sendBtn}
          onClick={handleSubmit}
          disabled={sendDisabled}
          aria-label="Отправить"
        >
          <ArrowUp size={20} weight="bold" />
        </button>
      </footer>
    </div>
  );
}

export const NativeAiView = memo(NativeAiViewInner);
