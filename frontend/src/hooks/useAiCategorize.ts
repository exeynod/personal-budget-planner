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

    const timerId = setTimeout(() => {
      suggestCategory(description)
        .then((result) => {
          setSuggestion(result);
        })
        .catch(() => {
          // Не показываем ошибку — AI-предложение опционально
          setSuggestion(null);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 500);

    return () => {
      clearTimeout(timerId);
      setLoading(false);
    };
  }, [description, enabled]);

  return { suggestion, loading };
}
