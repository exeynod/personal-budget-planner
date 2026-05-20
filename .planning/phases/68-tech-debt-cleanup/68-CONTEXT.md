# Phase 68: Tech-Debt Cleanup - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Mode:** Spec-driven (план-файл — точная спецификация; grey areas auto-decided)

<domain>
## Phase Boundary

Устранить pre-existing tech-debt, залогированный в фазе 67, плюс отложенные косметические находки ревью, чтобы получить **полностью зелёный baseline всех трёх стеков** перед архитектурными фазами 69 (codegen) и 70 (convergence).

**Источники истины (читать как спецификацию):**
- `.planning/CONVERGENCE-AND-DEBT-PLAN.md` — §«ФАЗА 68 — Tech-Debt Cleanup (workstream A)» (A1/A2/A3/A4, с симптомами, файлами, проверками).
- `.planning/phases/67-remediation-cleanup/deferred-items.md` — таблица отложенных находок (точные имена падающих тестов, root-cause гипотезы).
- `.planning/v1.1.2-MULTILEAD-REVIEW.md` — первоисточник находок (severity, file:line).

Кросс-доменная фаза: backend (Python/FastAPI/pytest), web (React/TS/vitest), iOS (Swift — только A4 косметика).

### В scope
- **A1 — Backend pro-gating 402-vs-429 (BLOCKER чистого pytest):** `tests/test_ai_cap_integration.py` (3 теста) + `tests/test_spend_cap_concurrent.py` (2 теста) ждут **429** (cap exceeded), получают **402** PRO_TIER_REQUIRED. `require_pro` (402) срабатывает в DI ДО `enforce_spending_cap` (429). Расследовать порядок гейтов: pro-юзер-over-cap должен получать 429, non-pro → 402. Скорее всего нужен и фикс порядка/фикстур, и приведение тестов в соответствие. Файлы: `app/api/dependencies.py` (require_pro, enforce_spending_cap ordering), оба тест-модуля.
- **A2 — onboarding/complete 422 + `category.code`/`ord` seed-drift:** `tests/test_categories.py::test_seed_creates_14_categories` + `tests/test_e2e_multi_user_lifecycle.py` (4 теста, `test_e2e_1/3/4/6`) падают. Два корня: (1) `POST /onboarding/complete` → 422 (валидатор что-то отвергает); (2) seed-helper не задаёт NOT-NULL `Category.code` (`^[0-9]{2}$`) + `ord` (дрейф схемы Phase 22). Несколько фаз чинили inline в своих фикстурах — нужен **системный фикс seed-helper**. Файлы: `tests/conftest.py`/seed-хелперы, `app/api/routes/onboarding*.py`, затронутые тесты.
- **A3 — Web tsc test-gate (R5/FE-F3 хвост):** фаза 67 исключила тест-файлы из prod `tsc -b`. Остались pre-existing type-ошибки в тестах: `node:fs`/`__dirname` без `@types/node`, prop-дрейф в `AiView.test.tsx`/`SettingsView.test.tsx`/`TxV10TabDemote.test.tsx`. Фикс: `npm i -D @types/node`; поправить prop-фикстуры; вернуть тесты под type-check (отдельный `typecheck:test` скрипт ИЛИ назад в `tsc -b`); CI гоняет и prod-build, и test-typecheck. Файлы: `frontend/package.json`, `frontend/tsconfig*.json`, три `.test.tsx`.
- **A4 — Косметика (comment-only):** `ios/.../Networking/Endpoints/AISuggestCategoryAPI.swift:23` — комментарий «0.5 threshold», бэкенд 0.35 после P2-5. Только текст комментария.

### ВНЕ scope (не планировать)
- R3/R4/R6/R7 — фазы 69/70.
- Backlog F (web↔iOS parity) — отдельно.
- HUMAN-UAT live-smoke — ручное владельцем.
- Реальное удаление мёртвого web v06-shell — владелец решил ОСТАВИТЬ оба шелла (фаза 70 R6).
</domain>

<decisions>
## Implementation Decisions

### Структура (для планировщика)
- Группировать по волнам с учётом codebase-независимости: backend (A1, A2), web (A3), iOS (A4) независимы → могут параллелиться.
- A1 и A2 оба трогают backend-тесты/фикстуры/`conftest.py` — проверить file-overlap; если seed-helper в общем `conftest.py` затрагивается обоими — сериализовать или объединить в один план/волну.
- Каждый план — атомарные коммиты, проверка билда/тестов соответствующего стека.

### A1 — направление расследования
- Гипотеза из плана: для pro-юзера cap-check должен идти ПОСЛЕ успешного pro-гейта (pro-over-cap → 429); для non-pro → 402. Тесты, вероятно, поднимают pro-юзера, но DI отдаёт 402 раньше. Решение: убедиться в корректном порядке гейтов И привести ожидания/фикстуры тестов в соответствие. Ручной sanity: non-pro→402, pro-over-cap→429.

### A2 — системный, не inline
- Фикс ОБЯЗАН быть в общем seed-helper (`conftest.py`/seed-функции), чтобы будущим тестам НЕ требовался inline seed-хак. Это явный acceptance-критерий.
- Разобраться, что именно валидатор `onboarding/complete` отвергает (422) — это отдельный корень от seed NOT-NULL.

### A3 — вернуть тесты под type-check
- Цель: prod-build остаётся зелёным И тест-файлы снова покрыты type-check (через `typecheck:test` или возврат в `tsc -b`). Оба гейта в CI.

### Claude's Discretion
- Точная нарезка планов/волн (по file-overlap backend-фикстур).
- Выбор: отдельный `typecheck:test` скрипт vs возврат тестов в основной `tsc -b`.
- Формулировка фикса порядка гейтов в A1 (фикстуры vs DI-порядок vs оба).
</decisions>

<code_context>
## Existing Code Insights

Точные file:line и root-cause — в `deferred-items.md` и review-doc. Ключевое:
- **Backend:** `app/api/dependencies.py` (require_pro ~стр.412 → 402, enforce_spending_cap → 429, порядок DI), `tests/test_ai_cap_integration.py`, `tests/test_spend_cap_concurrent.py`, `tests/test_categories.py`, `tests/test_e2e_multi_user_lifecycle.py`, `tests/conftest.py` + seed-хелперы (`seed_category` не задаёт `code`/`ord`), `app/api/routes/onboarding*.py`.
- **Web:** `frontend/package.json`, `frontend/tsconfig*.json`, `frontend/src/.../AiView.test.tsx`, `SettingsView.test.tsx`, `TxV10TabDemote.test.tsx`.
- **iOS:** `ios/.../Networking/Endpoints/AISuggestCategoryAPI.swift:23` (comment).

### Окружение / дисциплина
- **Backend:** локальный `.venv` БИТЫЙ → pytest гонять в docker `api`-контейнере (`docker compose up -d --build api`, затем вернуть стек). Money BIGINT cents NO float. Бизнес-даты DATE (MSK), audit TIMESTAMPTZ UTC. RLS/tenant scope per-request. Alembic revid ≤32 символов (но в 68 миграции маловероятны).
- **Web:** `cd frontend && npm run build` (tsc -b + vite) + `npx vitest run`.
- **iOS:** A4 — comment-only, build не обязателен, но если трогаем .swift вне generated — swift-format на файл.
- Коммиты атомарные с `Co-Authored-By: Claude ...`.
</code_context>

<specifics>
## Specific Ideas
- Acceptance фазы 68: backend pytest ПОЛНОСТЬЮ зелёный (ноль pre-existing фейлов); web build + vitest + test-typecheck зелёные; ноль inline seed-хаков нужно будущим тестам; A4 закрыт.
- Это baseline-гейт для фазы 69 (codegen): зелёные тесты = доверенная точка отсчёта для миграции на сгенерированные DTO.
</specifics>

<deferred>
## Deferred Ideas
- R3/R4/R6/R7 — фазы 69/70.
- Web↔iOS parity (backlog F).
</deferred>
