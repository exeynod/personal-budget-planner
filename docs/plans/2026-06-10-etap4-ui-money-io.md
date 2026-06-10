# Этап 4 — UI money-IO консолидация + dead-code + TG BackButton

Дата: 2026-06-10. Ветка `etap4-ui-money-io` (поверх Этапов 2-3). Фронт (React+Vite+TS),
без миграций/прод-деплой-риска. Выполняется выделенным Opus-агентом.

## Контекст (разведано)

- **`centsToRublesInput` — 4 копии** с ДРЕЙФОМ: `Plan/PlanCategoryDetailView.tsx` отдаёт `"0"`
  на ноль; `Management/TemplateCategoryDetailView.tsx`, `Recurring/RecurringEditor.tsx`,
  `Recurring/RecurringDuePrompt.tsx` отдают `''`. Иначе тела идентичны.
- **Money-форматтеры — НЕ все дубли:** `utils/format.ts` (Maximal Poster дизайн) и
  `screensV10/native/money.ts` (native shell дизайн) — **намеренно разные**, дуальный
  дизайн. **НЕ СЛИВАТЬ.** Парсинг уже консолидирован (`utils/parseMoney.ts` ре-экспортит
  `parseRublesToKopecks` из `format.ts`). Реальная цель — инлайновые ad-hoc форматтеры в
  экранах, дублирующие поведение существующего шаред-утиля, заменить на этот утиль.
- **`utils/parseWireDate.ts` — мёртв** (0 внешних usages, grep видит только сам файл).
- **TG BackButton — не подключён** (есть только тип в `api/client.ts:24`).

## Скоуп (узко — без churn)

1. **Один `centsToRublesInput`** в шаред-утиле (предложение: `screensV10/native/money.ts`,
   рядом с `formatMoneyNative`, т.к. все 4 копии — в V10-экранах). Сохранить дрейф поведения
   параметром: напр. `centsToRublesInput(cents, { emptyOnZero = true })` — `Plan` зовёт с
   `emptyOnZero: false` (показывает «0»), остальные — дефолт `''`. Удалить 4 локальные копии,
   импортировать шаред. Проверить парные «rubles→cents» парсеры рядом — если тоже копии,
   свести в `parseMoney.ts` (там уже есть `parseRublesToKopecksOr0`/`sanitizeMoneyInput`).
2. **Заменить инлайновые ad-hoc money-форматтеры** в экранах на корректный шаред-утиль
   (`format.ts` для Maximal, `native/money.ts` для native). ТОЛЬКО там, где инлайн дублирует
   поведение существующего утиля. НЕ менять визуальный результат. НЕ сливать два дизайн-утиля.
3. **Удалить мёртвый `utils/parseWireDate.ts`** (сперва подтвердить 0 внешних импортов
   `grep -rn "parseWireDate" src/` — должен быть только сам файл + его тест если есть; тест
   тоже удалить).
4. **Подключить TG BackButton** — провязать показ/скрытие + onClick→навигация назад в
   native/TMA-оболочке (найти роутер/навигацию V10; BackButton API — `api/client.ts:24`).

## Вне скоупа (отдельный заход)

Домиграция на `useResource` (крупный архитектурный рефактор data-fetching) — НЕ в этом этапе.

## Верификация

`cd frontend && npx tsc -b && npm run test` (vitest). Добавить/обновить unit-тест на
консолидированный `centsToRublesInput` (оба режима zero). **НЕ гонять Playwright e2e** —
Linux pixel-эталоны (память ci-e2e-gotchas), на Mac упадут. `make verify-all` в конце (tsc+lint).

## Инварианты

Деньги — копейки, рубли только на UI; дуальный дизайн (liquid_glass) не ломать; коммит
локальный на ветке (НЕ push); доки-комментарии утилей обновить в том же изменении.
