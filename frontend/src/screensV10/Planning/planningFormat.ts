// ADR-0008 — pure formatting helpers for the monthly planning gate.

const MONTHS_NOMINATIVE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

/**
 * «Май 2026» nominative month + year label from a period's ISO `period_start`
 * (`YYYY-MM-DD`). Used for the gate header «План на <месяц>». Falls back to a
 * bare «месяц» when the ISO is malformed.
 */
export function periodMonthLabel(periodStartIso: string | null | undefined): string {
  if (!periodStartIso) return 'месяц';
  const [y, m] = periodStartIso.split('-').map(Number);
  const name = MONTHS_NOMINATIVE[(m ?? 0) - 1];
  if (!name || !Number.isFinite(y)) return 'месяц';
  return `${name} ${y}`;
}
