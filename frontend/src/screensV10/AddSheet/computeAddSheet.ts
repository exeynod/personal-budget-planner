// Phase 25-10: pure compute helpers for the AddSheet screen.
//
// The AddSheet uses a custom 3×4 numeric keypad (no system keyboard) and
// drives a small string-state-machine for the amount input + a CTA state
// machine + a date-chip resolver. These are extracted as pure functions so
// they unit-test without React / jsdom / network and are reusable from
// either the keypad component or the AddSheet container.
//
// Threat coverage:
//   - T-25-10-04: amount string is built from digit/dot tokens only;
//     parseAmountToCents throws on any non-digit / non-single-dot input,
//     which combined with createActualV10's own amount_cents>0 guard
//     (Phase 25-03) ensures negative or malformed amounts cannot reach the
//     server even via developer-tool keypad bypass.

// ─────────────────── Types ───────────────────

/**
 * State of the CTA at the bottom of the AddSheet.
 *
 *  - 'empty'      — no amount entered (CTA reads «ВВЕДИТЕ СУММУ», disabled)
 *  - 'no-cat'     — amount > 0 but no category picked (disabled)
 *  - 'no-account' — amount + category present but no account loaded
 *                   (bootstrap fetch failed OR system has zero accounts);
 *                   gating prevents WR-25-01: posting `account_id: null`
 *                   silently falls into the legacy path → wallet balance
 *                   never updates (HOME-V10-04 desync).
 *  - 'ready'      — amount + category + account present (yellow, active)
 */
export type AddSheetCtaState = 'empty' | 'no-cat' | 'no-account' | 'ready';

/**
 * Date-chip identity. 'custom' means «Своя дата» — caller is responsible
 * for prompting the user via a native date picker and supplying the value.
 */
export type AddSheetDateChip = 'today' | 'yesterday' | 'custom';

// ─────────────────── Amount string state machine ───────────────────

/**
 * Append a digit character ('0'..'9') to the current amount-string.
 *
 * Rules:
 *  - Empty input + any digit → that digit ('5' or '0').
 *  - Leading-zero guard: '0' followed by non-dot digit replaces (so the
 *    sequence '0', '5' yields '5' — never '05'). Exception: '0' + '0'
 *    stays '0' (no double-zero either).
 *  - In integer mode (no dot yet) digit appends naturally ('5' + '0' = '50').
 *  - In decimal mode (after dot) the decimals are capped at 2 — a third
 *    decimal digit is silently dropped.
 *
 * Note: the dot is added via `appendDot`, not this function. Passing '.'
 * here is undefined behaviour — callers must route '.' through `appendDot`.
 */
export function appendDigit(current: string, digit: string): string {
  if (current === '') return digit;
  // Leading-zero guard — '0' alone is the implicit empty input.
  if (current === '0' && digit !== '0') return digit;
  if (current === '0' && digit === '0') return current;

  if (current.includes('.')) {
    const dotIdx = current.indexOf('.');
    const decimals = current.slice(dotIdx + 1);
    if (decimals.length >= 2) return current;
  }
  return current + digit;
}

/**
 * Insert the decimal dot.
 *
 *  - Empty input → '0.'  (so user sees the leading zero before the point).
 *  - Integer input → append '.'.
 *  - Already contains a dot → unchanged (idempotent).
 */
export function appendDot(current: string): string {
  if (current.includes('.')) return current;
  if (current === '') return '0.';
  return current + '.';
}

/** Remove the trailing character. Empty input → empty (no-op, no throw). */
export function backspace(current: string): string {
  if (current.length === 0) return '';
  return current.slice(0, -1);
}

// ─────────────────── parseAmountToCents ───────────────────

/**
 * Convert a keypad amount-string into BIGINT-compatible cents.
 *
 * Accepts only `[0-9]` and at most one `.` separator. Any other character
 * (incl. minus) throws — the keypad never emits such input, so a thrown
 * error here means the caller bypassed the keypad (developer tool,
 * stale state, programming bug).
 *
 * Examples:
 *   ''      → 0
 *   '0'     → 0
 *   '5'     → 500
 *   '5.'    → 500
 *   '5.5'   → 550
 *   '5.50'  → 550
 *   '0.05'  → 5
 */
export function parseAmountToCents(amountString: string): number {
  if (amountString === '') return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(amountString)) {
    throw new Error(
      `parseAmountToCents: invalid amount string «${amountString}»`,
    );
  }
  const dotIdx = amountString.indexOf('.');
  const intPart = dotIdx === -1 ? amountString : amountString.slice(0, dotIdx);
  const decPart = dotIdx === -1 ? '' : amountString.slice(dotIdx + 1);
  const intCents = (intPart === '' ? 0 : parseInt(intPart, 10)) * 100;
  // Pad decPart to length 2 so '5' becomes '50' kopeks.
  const decPadded = (decPart + '00').slice(0, 2);
  const decCents = decPadded === '' ? 0 : parseInt(decPadded, 10);
  return intCents + decCents;
}

// ─────────────────── CTA state machine ───────────────────

/**
 * Compute the CTA state from the current amount + category + account.
 *
 *  - amount === 0 → 'empty'
 *  - amount > 0  + categoryId === null → 'no-cat'
 *  - amount > 0  + categoryId set + accountId === null → 'no-account'
 *  - amount > 0  + categoryId + accountId all set → 'ready'
 *
 * `accountId` defaults to a sentinel symbol so existing call sites that
 * predate WR-25-01 still resolve to the original 3-state machine without
 * the account gate (legacy callers explicitly opted out of v1.0 wallet
 * accounting). Pass `null` to enable the strict gate (recommended for
 * v1.0 UI per WR-25-01 review fix).
 */
const SKIP_ACCOUNT_GATE = Symbol('SKIP_ACCOUNT_GATE');

export function ctaState(
  amountCents: number,
  categoryId: number | null,
  accountId: number | null | typeof SKIP_ACCOUNT_GATE = SKIP_ACCOUNT_GATE,
): AddSheetCtaState {
  if (amountCents <= 0) return 'empty';
  if (categoryId === null) return 'no-cat';
  if (accountId === null) return 'no-account';
  return 'ready';
}

// ─────────────────── Date chip → ISO date ───────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toISODateLocal(d: Date): string {
  // Use local-time components so the chip honours the user's wall clock,
  // not UTC — prevents «Сегодня» from rolling to «Вчера» across midnight
  // for users east of UTC. Backend stores tx_date as DATE (no timezone).
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Resolve a chip selection into an ISO date string (or null for 'custom').
 *
 *  - 'today'     → today.toISOString-equivalent local YYYY-MM-DD
 *  - 'yesterday' → today − 1 day (local)
 *  - 'custom'    → null (caller must prompt for the actual date)
 */
export function defaultDateForChip(
  chip: AddSheetDateChip,
  today: Date,
): string | null {
  if (chip === 'custom') return null;
  if (chip === 'today') return toISODateLocal(today);
  // 'yesterday'
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  return toISODateLocal(y);
}

// ─────────────────── Period-aware date helpers (Phase P2) ───────────────────

/** Minimal period shape the AddSheet needs (subset of PeriodRead). */
export interface AddSheetPeriodBounds {
  id: number;
  period_start: string; // ISO YYYY-MM-DD
  period_end: string; // ISO YYYY-MM-DD
}

/** Parse a wire DATE (`YYYY-MM-DD`) into a LOCAL-midnight Date. */
function parseISODateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Phase P2 (period switching): default an entry's date INTO the viewed period.
 *
 * Returns the ISO date the AddSheet should pre-fill when opened while viewing
 * `period`, clamped to `[period_start, min(today, period_end)]`:
 *   - viewing the ACTIVE period (today within range)  → today
 *   - viewing a CLOSED past period (today after end)   → period_end (its last day)
 *   - viewing a FUTURE period (today before start)     → period_start
 *
 * This guarantees the pre-filled date always lands inside the viewed period so
 * the backend attributes the new fact to the period the user is looking at.
 */
export function defaultDateForPeriod(
  period: AddSheetPeriodBounds,
  today: Date,
): string {
  const start = parseISODateLocal(period.period_start);
  const end = parseISODateLocal(period.period_end);
  const todayMid = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  // upper bound = min(today, end)
  const upper = todayMid.getTime() < end.getTime() ? todayMid : end;
  // clamp(start, upper)
  const clamped = upper.getTime() < start.getTime() ? start : upper;
  return toISODateLocal(clamped);
}

/** Inclusive [min, max] ISO date bounds for the date input when scoped. */
export function periodDateInputBounds(
  period: AddSheetPeriodBounds,
  today: Date,
): { min: string; max: string } {
  const end = parseISODateLocal(period.period_end);
  const todayMid = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  // Never allow a future date beyond today even inside an active period.
  const max = todayMid.getTime() < end.getTime() ? todayMid : end;
  return { min: period.period_start, max: toISODateLocal(max) };
}

/**
 * Phase P2: find the period an ISO date falls into (inclusive bounds).
 *
 * Used after a successful submit to auto-switch the viewed period when the
 * entry landed outside it. Returns null when no period covers the date (e.g.
 * the server just auto-created one and the local list is stale — caller then
 * reloads the provider).
 */
export function findPeriodForDate<T extends AddSheetPeriodBounds>(
  periods: ReadonlyArray<T>,
  isoDate: string,
): T | null {
  const t = parseISODateLocal(isoDate).getTime();
  for (const p of periods) {
    const start = parseISODateLocal(p.period_start).getTime();
    const end = parseISODateLocal(p.period_end).getTime();
    if (t >= start && t <= end) return p;
  }
  return null;
}
