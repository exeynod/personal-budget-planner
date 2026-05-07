---
plan_id: 16-09-code-01-money-parser-dedup
phase: 16
plan: 09
type: execute
wave: 1
depends_on: []
requirements: [CODE-01]
files_modified:
  - frontend/src/utils/format.ts
  - frontend/src/utils/format.test.ts
  - frontend/src/components/ActualEditor.tsx
  - frontend/src/components/PlanItemEditor.tsx
  - frontend/src/components/PlanRow.tsx
  - frontend/tests/e2e/money-parser-parity.spec.ts
autonomous: true
must_haves:
  truths:
    - "`parseRublesToKopecks` определён РОВНО ОДИН РАЗ — в `frontend/src/utils/format.ts` (export)"
    - "ActualEditor и PlanItemEditor (и PlanRow.tsx) импортируют helper из `../utils/format`, локальные дубли удалены"
    - "vitest проходит: `'100,50'` → 10050; `'1 000.5'` → 100050; `'0.01'` → 1; `'0.001'` → null; `''` → null; `'-50'` → null; `'abc'` → null"
    - "Playwright e2e — ввод одинаковой строки `'100,50'` в обоих редакторах даёт одинаковый `amount_cents` (равный 10050)"
  artifacts:
    - path: "frontend/src/utils/format.ts"
      provides: "Single canonical parseRublesToKopecks (digit-walk parser, decimal-grade)"
      exports: ["parseRublesToKopecks"]
      contains: "parseRublesToKopecks"
    - path: "frontend/src/utils/format.test.ts"
      provides: "Vitest unit-tests на edge-кейсы"
      exports: []
    - path: "frontend/tests/e2e/money-parser-parity.spec.ts"
      provides: "Playwright cross-editor parity test"
      exports: []
  key_links:
    - from: "frontend/src/components/ActualEditor.tsx"
      to: "import { parseRublesToKopecks } from '../utils/format'"
      via: "ESM import, без локального дубля"
      pattern: "import.*parseRublesToKopecks.*utils/format"
    - from: "frontend/src/components/PlanItemEditor.tsx"
      to: "import { parseRublesToKopecks } from '../utils/format'"
      via: "ESM import"
      pattern: "import.*parseRublesToKopecks.*utils/format"
---

<objective>
Закрыть CODE-01 (HIGH money-invariant): `parseRublesToKopecks` уже существует в `frontend/src/utils/format.ts:48` (через `parseFloat`-based), но дублируется в `ActualEditor.tsx:48` (digit-walk через split на `.`), `PlanItemEditor.tsx:45` (через `parseFloat`), `PlanRow.tsx:17`. Семантика разная: один даёт null для `'0.001'`, другой принимает.

Purpose: Per D-16-09 — единый digit-walk парсер в `utils/format.ts`. Семантика edge-кейса `'0.001'` → null (Claude's discretion закрепляет: 3+ знаков после запятой → отказ, не округление, потому что money-invariant в проекте — «no float, BIGINT копейки»). Это согласуется с REQUIREMENTS acceptance test.

Output: Единый exported parser + vitest на edge-кейсы (`'100,50'`, `'1 000.5'`, `'0.01'`, `'0.001'`, `''`, `'-50'`, `'abc'`) + Playwright e2e на cross-editor parity.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/16-security-ai-hardening/16-CONTEXT.md
@/Users/exy/.claude/plans/serialized-prancing-spark.md

@frontend/src/utils/format.ts
@frontend/src/components/ActualEditor.tsx
@frontend/src/components/PlanItemEditor.tsx
@frontend/src/components/PlanRow.tsx
@frontend/src/api/client.test.ts
@frontend/tests/e2e/home.spec.ts
@frontend/package.json
@frontend/vite.config.ts

<interfaces>
Existing canonical (in format.ts:48-54) — uses parseFloat (drops precision on edge cases like `'0.001'` → 0.001 → 0 cents):
```
export function parseRublesToKopecks(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const f = parseFloat(cleaned);
  if (isNaN(f) || !isFinite(f) || f <= 0) return null;
  return Math.round(f * 100);
}
```

ActualEditor.tsx:48 — already uses digit-walk semantics (closer to spec):
```
function parseRublesToKopecks(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const [intPart, fracPart = ''] = cleaned.split('.');
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(fracPart)) return null;
  const kopecks = parseInt(intPart, 10) * 100 + parseInt(fracPart.padEnd(2, '0'), 10);
  return kopecks > 0 ? kopecks : null;
}
```

PlanItemEditor.tsx:45 — uses parseFloat (different semantics — accepts `'0.001'` → 0):
```
function parseRublesToKopecks(input: string): number | null {
  const cleaned = input.replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const f = parseFloat(cleaned);
  if (isNaN(f) || !isFinite(f)) return null;
  return Math.round(f * 100);
}
```

PlanRow.tsx:17 — third copy (probably parseFloat-style, see file).

DECISION: digit-walk is canonical (ActualEditor's existing impl). Replace format.ts impl + delete duplicates + import everywhere.
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User typed string -> rubles parser -> kopecks integer -> POST /actual or POST /planned | Different parsers produce different amount_cents for identical input strings. Inconsistency = silent data corruption. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-16-09-01 | Tampering / data integrity | Inconsistent parsers across editors | mitigate | Per D-16-09: единый digit-walk impl в format.ts; импорт в ActualEditor/PlanItemEditor/PlanRow; локальные дубли удалены. Vitest + Playwright проверяют идентичность. |
| T-16-09-02 | Tampering | parseFloat IEEE 754 precision loss на ровных копейках | mitigate | Digit-walk parser использует целочисленную арифметику (parseInt + multiplication) — нет float ошибок. |
| T-16-09-03 | UX / data | `'0.001'` → ambiguous (0 cents после round или null reject) | mitigate | Закрепляем семантику: 3+ дробных цифр → null (отказ ввода). Соответствует REQUIREMENTS acceptance edge-case. |
| T-16-09-04 | Defense-in-depth | Backend Pydantic gt=0 last line | accept | Already in place; this fix closes UI/UX gap (показать пользователю проблему перед submit, не на 422). |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: Заменить parseRublesToKopecks в format.ts на digit-walk + расширенный test</name>
  <files>frontend/src/utils/format.ts, frontend/src/utils/format.test.ts</files>
  <action>
Per D-16-09: переписать canonical `parseRublesToKopecks` в `frontend/src/utils/format.ts` через digit-walk + vitest на edge-кейсы.

Точные шаги:

1. В `frontend/src/utils/format.ts`, заменить блок строк 41-54 (jsdoc + function):
```
/**
 * Parse user-typed rubles string into kopecks integer. Returns null on invalid.
 *
 * Decimal-grade digit-walk parser (NO parseFloat — IEEE 754 loses precision
 * on round kopeck amounts). Money invariant per CLAUDE.md: «no float, BIGINT
 * копейки».
 *
 * Accepts:
 *  - `"1500"` → 150000
 *  - `"1500,50"` → 150050  (comma decimal — ru-RU)
 *  - `"1500.50"` → 150050  (dot decimal)
 *  - `"1 500"` → 150000    (nbsp/space thousand-sep, ignored)
 *  - `"0.01"` → 1          (smallest positive kopek)
 *
 * Rejects (returns null):
 *  - `""` (empty)
 *  - `"abc"` / mixed letters
 *  - `"-50"` (negative — money invariant)
 *  - `"0"` / `"0.00"` (must be > 0)
 *  - `"0.001"` (3+ fractional digits — refuse, not round)
 *  - `"1.2.3"` (multiple separators)
 */
export function parseRublesToKopecks(input: string): number | null {
  // Strip whitespace (incl. nbsp  ); normalise comma → dot.
  const cleaned = input.replace(/[\s ]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  // Reject negative / non-digit prefix.
  if (!/^[0-9.]+$/.test(cleaned)) return null;

  const parts = cleaned.split('.');
  if (parts.length > 2) return null;  // multiple dots
  const [intPart, fracPart = ''] = parts;
  if (intPart === '' && fracPart === '') return null;
  if (intPart !== '' && !/^[0-9]+$/.test(intPart)) return null;
  // Fractional part: 0..2 digits (3+ → reject per money invariant).
  if (!/^[0-9]{0,2}$/.test(fracPart)) return null;

  const intVal = intPart === '' ? 0 : parseInt(intPart, 10);
  const fracVal = parseInt((fracPart || '0').padEnd(2, '0'), 10);
  const kopecks = intVal * 100 + fracVal;
  return kopecks > 0 ? kopecks : null;
}
```

2. Создать `frontend/src/utils/format.test.ts`:
```
import { describe, it, expect } from 'vitest';
import { parseRublesToKopecks, formatKopecks, formatKopecksWithCurrency } from './format';

describe('parseRublesToKopecks (CODE-01)', () => {
  describe('valid inputs', () => {
    it.each([
      ['1500', 150000],
      ['1500,50', 150050],
      ['1500.50', 150050],
      ['1 500', 150000],
      ['1 000.5', 100050],
      ['1 000,5', 100050],
      ['100,50', 10050],
      ['0.01', 1],
      ['0,01', 1],
      ['0.1', 10],
      ['1', 100],
      ['9999999.99', 999999999],
    ])('parses %j → %i kopecks', (input, expected) => {
      expect(parseRublesToKopecks(input)).toBe(expected);
    });
  });

  describe('invalid inputs return null', () => {
    it.each([
      ['', 'empty'],
      ['abc', 'letters'],
      ['1.2.3', 'multi-dot'],
      ['-50', 'negative'],
      ['0', 'zero'],
      ['0.00', 'zero with decimals'],
      ['0,00', 'zero with comma decimals'],
      ['0.001', '3+ fractional digits per money invariant'],
      ['100.123', '3+ fractional'],
      ['1,234,567', 'comma as thousand-sep (NOT supported, ru-RU uses space)'],
      ['+100', 'leading plus sign'],
      ['1e5', 'scientific notation'],
      ['Infinity', 'infinity literal'],
      ['NaN', 'NaN literal'],
      ['  ', 'only whitespace'],
    ])('rejects %j (%s) → null', (input) => {
      expect(parseRublesToKopecks(input)).toBeNull();
    });
  });
});

describe('formatKopecks (smoke — no regress)', () => {
  it('formats simple int', () => {
    expect(formatKopecks(420000)).toMatch(/4\s200/);
  });
  it('appends currency', () => {
    expect(formatKopecksWithCurrency(420000)).toMatch(/4\s200\s₽/);
  });
});
```

3. Если `frontend/package.json` не имеет `test` script — добавить:
```
"test": "vitest run",
"test:watch": "vitest"
```
(Plan 16-01 уже это добавляет; если он применяется первым — пропустить. Если этот plan идёт первым — добавить + jsdom-config в vite.config.ts. Координация: оба plan'а в Wave 1; executor должен синхронизировать в одной транзакции если первый ещё не применил.)

  </action>
  <verify>
    <automated>cd frontend && npm test -- --run format.test 2>&1 | grep -E "(passed|✓ parseRublesToKopecks)" | head -5</automated>
  </verify>
  <done>vitest проходит >= 25 тест-кейсов; canonical parser теперь digit-walk; edge-case 0.001 → null.</done>
</task>

<task type="auto">
  <name>Task 2: Импортировать canonical parser в редакторы, удалить локальные дубли</name>
  <files>frontend/src/components/ActualEditor.tsx, frontend/src/components/PlanItemEditor.tsx, frontend/src/components/PlanRow.tsx</files>
  <action>
Удалить локальные `parseRublesToKopecks` из всех editors, импортировать из `../utils/format`.

Точные шаги:

1. В `frontend/src/components/ActualEditor.tsx`:
   - Найти строки 47-55 (jsdoc + function `parseRublesToKopecks`) и удалить полностью.
   - Найти `function formatKopecksToRubles` (строки 57-60) — оставить пока (форматер тоже дублируется, но D-16-09 явно говорит про parser; форматер — отдельный low-priority дубль).
   - В импортах (строка 1-5), добавить:
   ```
   import { parseRublesToKopecks } from '../utils/format';
   ```
   - Подтвердить, что использование на строке 128 (`const amountCents = parseRublesToKopecks(amountStr);`) теперь ссылается на импортированный helper.

2. В `frontend/src/components/PlanItemEditor.tsx`:
   - Найти строки 44-51 (jsdoc + `parseRublesToKopecks`) и удалить полностью.
   - В импортах (строка 1-4), добавить:
   ```
   import { parseRublesToKopecks } from '../utils/format';
   ```
   - Подтвердить, что использование на строке 108 ссылается на импортированный helper.

3. В `frontend/src/components/PlanRow.tsx`:
   - Найти локальный `parseRublesToKopecks` (примерно строка 17 — see grep output) и удалить.
   - Добавить импорт:
   ```
   import { parseRublesToKopecks } from '../utils/format';
   ```
   - Сохранить usage (на строке ~60).

4. Проверка: `tsc --noEmit` чисто.
  </action>
  <verify>
    <automated>cd /Users/exy/pet_projects/tg-budget-planner && grep -c "function parseRublesToKopecks" frontend/src/components/ActualEditor.tsx frontend/src/components/PlanItemEditor.tsx frontend/src/components/PlanRow.tsx | tee /dev/stderr | grep -E ":0$" | wc -l | grep -E "^3$" && grep -l "import.*parseRublesToKopecks.*utils/format" frontend/src/components/ActualEditor.tsx frontend/src/components/PlanItemEditor.tsx frontend/src/components/PlanRow.tsx | wc -l | grep -E "^3$" && cd frontend && npx tsc --noEmit 2>&1 | tail -5</automated>
  </verify>
  <done>Все 3 локальных дубля удалены; все 3 файла импортируют canonical helper; tsc --noEmit без ошибок.</done>
</task>

<task type="auto">
  <name>Task 3: Playwright cross-editor parity e2e</name>
  <files>frontend/tests/e2e/money-parser-parity.spec.ts</files>
  <action>
Playwright тест — ввод одинаковых строк в обоих редакторах (ActualEditor через bottom-sheet «Добавить трату» + PlanItemEditor через «Добавить план») и проверка одинаковых amount_cents в API-payload.

Стратегия: route.fulfill для POST /actual и POST /planned, проверка `body.amount_cents` идентичности.

Точный код:
```
import { test, expect } from '@playwright/test';

/**
 * CODE-01 e2e parity:
 *  - Open ActualEditor, type "100,50", submit, intercept POST /actual,
 *    capture amount_cents.
 *  - Open PlanItemEditor, type "100,50", submit, intercept POST /planned,
 *    capture amount_cents.
 *  - Assert both amounts equal (and equal to 10050).
 */
test('CODE-01: parseRublesToKopecks parity across ActualEditor and PlanItemEditor', async ({ page }) => {
  let actualAmount: number | null = null;
  let plannedAmount: number | null = null;

  // Telegram WebApp mock — same pattern as home.spec.ts.
  await page.addInitScript(() => {
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: 'mock=true',
        initDataUnsafe: { user: { id: 123 } },
        ready: () => undefined,
        expand: () => undefined,
        themeParams: {},
      },
    };
  });

  // Mock categories (so editor renders + select is fillable).
  await page.route('**/api/v1/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [
        { id: 1, name: 'Еда', kind: 'expense', is_archived: false },
      ] }),
    });
  });

  // Capture POST /actual.
  await page.route('**/api/v1/actual', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      actualAmount = body.amount_cents;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, ...body }),
      });
      return;
    }
    await route.continue();
  });

  // Capture POST /planned.
  await page.route('**/api/v1/planned', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      plannedAmount = body.amount_cents;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, ...body }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');

  // ---- ActualEditor flow ----
  // (Selector locations depend on existing nav; adjust to match Phase 7 nav refactor — sketch 002-B bottom-sheet).
  await page.click('button:has-text("Добавить трату")');
  await page.fill('input[inputMode="decimal"]', '100,50');
  await page.selectOption('select', { value: '1' });
  await page.click('button:has-text("Сохранить")');
  await expect.poll(() => actualAmount).not.toBeNull();

  // ---- PlanItemEditor flow ----
  await page.click('a:has-text("План"), [href="/plan"]').first();
  await page.click('button:has-text("Добавить")').first();
  await page.fill('input[inputMode="decimal"]', '100,50');
  await page.selectOption('select', { value: '1' });
  await page.click('button:has-text("Сохранить")');
  await expect.poll(() => plannedAmount).not.toBeNull();

  // ---- Parity assertion ----
  expect(actualAmount).toBe(10050);
  expect(plannedAmount).toBe(10050);
  expect(actualAmount).toBe(plannedAmount);
});
```

Note: точные селекторы зависят от Phase 7 nav-refactor (sketch 002-B + 005-B). Executor: запустить Playwright в headed mode (`npx playwright test --headed`) и подкорректировать selectors под фактический DOM, либо использовать `data-testid` атрибуты если они есть в проекте. Если existing v04-ui.spec.ts уже навигирует Plan/Actual flow — переиспользовать паттерн.

FAIL до Task 1 + 2: разные парсеры → возможно разный amount_cents (parseFloat в PlanItemEditor может отличаться от digit-walk в ActualEditor для edge-input — но `100,50` оба обработают одинаково; для `0.001` они расходятся; используем `0.001` если хочется реальной FAIL разницы).
PASS после Task 1 + 2: единый импортированный helper → идентичный amount_cents.
  </action>
  <verify>
    <automated>cd frontend && npx playwright test tests/e2e/money-parser-parity.spec.ts --reporter=list 2>&1 | grep -E "(passed|failed)" | head -5</automated>
  </verify>
  <done>Playwright cross-editor parity test passes; actualAmount === plannedAmount === 10050.</done>
</task>

</tasks>

<verification>
Phase-level acceptance:
1. `cd frontend && npm test -- --run format.test` → 25+ passed.
2. `cd frontend && npx playwright test tests/e2e/money-parser-parity.spec.ts` → 1 passed.
3. `cd frontend && npx tsc --noEmit` → exit 0.
4. `grep -c "function parseRublesToKopecks" frontend/src/components/*.tsx` → 0.
5. `grep -l "import.*parseRublesToKopecks.*utils/format" frontend/src/components/*.tsx | wc -l` ≥ 3 (ActualEditor + PlanItemEditor + PlanRow).
</verification>

<success_criteria>
CODE-01 закрыт:
- parseRublesToKopecks определён единожды в format.ts (digit-walk impl).
- ActualEditor / PlanItemEditor / PlanRow импортируют canonical helper.
- vitest покрывает edge-кейсы из REQUIREMENTS.md (`100,50` → 10050; `1 000.5` → 100050; `0.01` → 1; `0.001` → null).
- Playwright e2e подтверждает cross-editor parity.
- Существующие тесты (client.test.ts, e2e suites) не сломались.
</success_criteria>

<output>
After completion, create `.planning/phases/16-security-ai-hardening/16-09-SUMMARY.md`
</output>

## Commit Message
fix(16): CODE-01 single canonical parseRublesToKopecks digit-walk parser + dedup ActualEditor/PlanItemEditor/PlanRow + vitest + Playwright parity
