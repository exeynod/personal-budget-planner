/**
 * useAiCategorize — debounced AI category suggestion hook (AICAT-02, AICAT-05).
 *
 * Вызывает GET /ai/suggest-category с debounce 500ms.
 * Если enabled=false или description.length < 3 — сразу возвращает null.
 */
import { useEffect, useState } from 'react';
import { suggestCategory } from '../api/ai';
import type { AiSuggestResponse } from '../api/types';

export interface UseAiCategorizeResult {
  suggestion: AiSuggestResponse | null;
  loading: boolean;
}

export function useAiCategorize(
  description: string,
  enabled: boolean,
): UseAiCategorizeResult {
  const [suggestion, setSuggestion] = useState<AiSuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || description.length < 3) {
      setSuggestion(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // P2-8 (FE-F5): stale-guard — a slow in-flight response from a superseded
    // query must not overwrite a newer result. The cleanup flips `cancelled`,
    // so any resolution after re-run / unmount bails before calling setState.
    let cancelled = false;

    const timerId = setTimeout(() => {
      suggestCategory(description)
        .then((result) => {
          if (cancelled) return;
          setSuggestion(result);
        })
        .catch(() => {
          if (cancelled) return;
          // Не показываем ошибку — AI-предложение опционально
          setSuggestion(null);
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timerId);
      setLoading(false);
    };
  }, [description, enabled]);

  return { suggestion, loading };
}
