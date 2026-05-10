// Phase 27-02: pure compute helpers for the V10 AI screen.
//
// Surface (consumed by AiMount + AiView + tests):
//   - MONTHS_RU_GEN — 12 RU month names in genitive case (января … декабря).
//   - todayRu(d) — formats a Date as «{day} {monthGen}» (e.g. "9 мая").
//   - DEFAULT_SUGGESTION_CHIPS — fixed list of 4 prompt suggestions shown
//     under the «ПОДСКАЗКИ · ТАПНИ» eyebrow when chat is empty.
//
// All functions are deterministic, pure, no React / no fetch. Tested in
// `__tests__/computeAi.test.ts` (6 cases — TDD RED → GREEN gate).
//
// Note: a sister `MONTHS_RU_GENITIVE` already exists in
// `screensV10/common/format.ts` for the period eyebrow formatter; we keep
// the Ai-local copy so the AI feature does not pull common into its
// pure-helpers test surface (and to make the wave-2 disjoint-files
// gate clean — common/format.ts is not in this plan's files_modified).

export const MONTHS_RU_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

export function todayRu(d: Date): string {
  return `${d.getDate()} ${MONTHS_RU_GEN[d.getMonth()]}`;
}

export const DEFAULT_SUGGESTION_CHIPS = [
  'Сколько я потратил на кафе в мае?',
  'Покажи топ-3 категории за неделю',
  'Создай регулярный платёж 1490 ₽ Wildberries 5 числа',
  'Куда уходят деньги в этом месяце?',
] as const;
