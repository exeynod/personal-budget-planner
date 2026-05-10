/**
 * Phase 27-02 — typed wrapper for `GET /api/v1/ai/observation` (v1.0 surface).
 *
 * Backend Phase 27-01 added the `observation_router` (separate sub-router
 * without `enforce_spending_cap` because observation is not an LLM call).
 * Returns one short Russian sentence describing the user's current
 * financial state, computed by a 4-rule priority chain server-side and
 * cached per-user for 1h.
 *
 * Consumed by `screensV10/Ai/AiMount.tsx` on mount; renders inside
 * the initial-state DM Serif Italic 36px observation block.
 */
import { apiFetch } from '../client';

/**
 * Wire shape of `GET /api/v1/ai/observation`.
 *
 * Matches `app/api/schemas/ai.py::ObservationResponse` (Phase 27-01):
 *   - `text`: pre-rendered Russian sentence (e.g. "Май в плюсе на 12345 ₽").
 *   - `generated_at`: ISO-8601 UTC timestamp of when the observation was
 *     computed; used by the UI subtitle eyebrow when relative-time hints
 *     are added later.
 */
export interface ObservationResponse {
  text: string;
  generated_at: string; // ISO-8601 UTC
}

/**
 * GET /api/v1/ai/observation
 *
 * `apiFetch` already prefixes `/api/v1`, so we pass the trailing path.
 * Throws `ApiError` on non-2xx; the caller (`AiMount`) catches and
 * surfaces a friendly «Не удалось загрузить наблюдение» error so the
 * chip-suggestions still render even when the observation fails.
 */
export async function fetchObservation(): Promise<ObservationResponse> {
  return apiFetch<ObservationResponse>('/ai/observation', { method: 'GET' });
}
