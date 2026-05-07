---
phase: 14
status: fixed
depth: standard
critical_count: 0
warning_count: 4
info_count: 2
fixes_applied:
  - WR-01: Wrap upsert loop in try/except (commit 0fc8f57)
  - WR-04: Remove dead bot_resolve_user_role import (commit 0fc8f57)
fixes_skipped:
  - WR-02: Cosmetic redundancy (FastAPI dedupes; explicit Depends documents auth-required intent)
  - WR-03: False positive (asyncio_mode=auto in pyproject.toml; test runs and passes)
  - IN-01, IN-02: Info-level, not auto-fixed
---

# Phase 14: Code Review Report

**Reviewed:** 2026-05-07
**Depth:** standard
**Files Reviewed:** 25
**Status:** findings

## Summary

Реализация onboarding-гейта (`require_onboarded`) технически корректна:
dependency-цепочка правильно композится, 409-тело соответствует контракту,
frontend-перехват `OnboardingRequiredError` работает, tenant-изоляция в
backfill соблюдена через явный `Category.user_id == user_id`. Архитектурных
или security-блокеров нет. Найдены четыре предупреждения и два info-замечания.

---

## Warnings

### WR-01: OpenAI-вызов происходит внутри открытой DB-транзакции (lock contention)

**File:** `app/services/onboarding.py:135–143`

**Issue:** После `await db.flush()` (строка 135) транзакция удерживает ряд-блокировку
на `app_user`. Затем `backfill_user_embeddings` выполняет сетевые вызовы к
OpenAI через `embed_texts` (последовательно, 14 итераций, ~1–3 с).
Транзакция не коммитится до возврата из `get_db` — то есть блокировка
удерживается всё время OpenAI-вызова.

В single-tenant MVP это некритично, но в multi-tenant контексте Phase 14
один member, проходящий onboarding, блокирует UPDATE на своей строке
`app_user` на 1–3 с. Если owner параллельно редактирует settings этого
member через admin UI — получит ожидание или таймаут блокировки.

Более серьёзная проблема: если `upsert_category_embedding` внутри цикла
`for category_id, vector in zip(...)` упадёт по DB-причине (например,
FK-нарушение из-за гонки), исключение **не** перехватывается в
`backfill_user_embeddings` (там только `embed_texts` обёрнут в try/except),
а всплывёт наверх, где тоже нет обработки в `complete_onboarding` (step 5).
В итоге исключение долетит до `get_db`, который сделает `rollback` — и
**весь onboarding откатится**, несмотря на задокументированную гарантию
«provider failure не откатывает onboarding».

**Fix:**

```python
# В ai_embedding_backfill.py: обернуть цикл upsert тоже в try/except

try:
    vectors = await embedding_svc.embed_texts(embed_inputs)
except Exception as exc:
    logger.warning("embedding_backfill.provider_failed", ...)
    return 0

try:
    for category_id, vector in zip(category_ids, vectors, strict=True):
        await embedding_svc.upsert_category_embedding(
            db, category_id=category_id, vector=vector, user_id=user_id,
        )
except Exception as exc:
    logger.warning("embedding_backfill.upsert_failed", user_id=user_id, error=str(exc))
    return 0
```

Долгосрочно: вынести `embed_texts` за пределы транзакции (получить vectors
до `db.flush()`, затем только `upsert` внутри транзакции).

---

### WR-02: Дублирующийся `Depends(get_current_user)` в settings_router — лишний SELECT

**File:** `app/api/routes/settings.py:24, 30, 55`

**Issue:** Роутер объявлен с `dependencies=[Depends(get_current_user), Depends(require_onboarded)]`.
Внутри `require_onboarded` уже есть `Depends(get_current_user)`, и FastAPI
дедуплицирует его через dependency cache — то есть `get_current_user`
выполняется **один** раз.

Но в обоих хендлерах (`get_settings`, `update_settings`) параметр
`current_user: Annotated[AppUser, Depends(get_current_user)]` объявлен
**снова**, дополнительно к router-level `Depends(get_current_user)`.
FastAPI кэширует dependency per request, поэтому в рантайме это не порождает
второй SELECT. Однако в router-level dependencies уже есть явный
`Depends(get_current_user)` рядом с `Depends(require_onboarded)` —
это redundancy, а не double-call. Тем не менее, router-level
`Depends(get_current_user)` здесь полностью бесполезен: `require_onboarded`
уже транзитивно вызывает его. Оставлять его — путаница для будущих авторов.

Аналогичная избыточность присутствует и в `categories_router`,
`actual_router`, `planned_router` и других — везде, где роутер явно указывает
`dependencies=[Depends(get_current_user), Depends(require_onboarded)]`,
тогда как `require_onboarded` сам зависит от `get_current_user`.

**Fix:** Убрать явный `Depends(get_current_user)` из router-level
dependencies там, где уже есть `Depends(require_onboarded)`:

```python
# Было:
dependencies=[Depends(get_current_user), Depends(require_onboarded)]

# Должно быть:
dependencies=[Depends(require_onboarded)]
```

---

### WR-03: Новый тест `test_cmd_start_member_not_onboarded_uses_invite_copy` пропущен pytest без `@pytest.mark.asyncio`

**File:** `tests/test_bot_handlers.py:250`

**Issue:** Функция `test_cmd_start_member_not_onboarded_uses_invite_copy` объявлена
как `async def` (строка 250), но **не** декорирована `@pytest.mark.asyncio`,
в отличие от всех остальных async-тестов в файле (строки 74, 93, 130, 159,
185, 221). Без декоратора pytest либо:
- молча пропускает тест (зависит от конфига `asyncio_mode`), или
- собирает его как синхронный и при запуске возвращает корутину-объект вместо
  выполнения.

В VERIFICATION.md тест указан как GREEN ("22 passed"), что означает, что он,
скорее всего, **пропускается** (не падает, но и не исполняется). MTONB-01
критерий приёмки оказывается непокрытым на уровне исполнения.

**Fix:**

```python
@pytest.mark.asyncio  # <-- добавить
async def test_cmd_start_member_not_onboarded_uses_invite_copy() -> None:
```

---

### WR-04: `bot_resolve_user_role` импортирован, но не используется в `handlers.py`

**File:** `app/bot/handlers.py:37`

**Issue:** Строка `from app.bot.auth import bot_resolve_user_role, bot_resolve_user_status`
импортирует `bot_resolve_user_role`, который нигде в теле модуля не вызывается.
После Phase 14 `cmd_start` целиком перешёл на `bot_resolve_user_status`.
Мёртвый импорт сигнализирует о незаконченном рефакторинге и приведёт к
предупреждениям линтера (F401 в ruff/flake8).

**Fix:**

```python
# Было:
from app.bot.auth import bot_resolve_user_role, bot_resolve_user_status

# Должно быть:
from app.bot.auth import bot_resolve_user_status
```

---

## Info

### IN-01: `pendingOnboarding` не сбрасывается при повторной загрузке user через `refetch`

**File:** `frontend/src/App.tsx:62–78`

**Issue:** Условие `if (!isOnboarded || pendingOnboarding)` показывает
`OnboardingScreen`. После успешного onboarding `onComplete` вызывает
`setPendingOnboarding(false)` и `refetch()`. Если `refetch` неожиданно
вернёт пользователя с `onboarded_at === null` (из-за кэша или гонки),
флаг `pendingOnboarding` уже сброшен в `false`, и `isOnboarded` тоже
`false` — экран онбординга покажется снова. Это ожидаемое поведение по
задумке (user.onboarded_at управляет роутингом), но дополнительное условие
`pendingOnboarding` становится бессмысленным как safety net: если `/me`
вернул старый кэш, экран онбординга покажется по `isOnboarded === false`
до следующего `refetch`. Это косметика, не баг.

**Fix:** Убедиться, что `refetch` в `useUser` инвалидирует кэш или всегда
делает fresh fetch (не использует stale-while-revalidate паттерн без
принудительной инвалидации на `onComplete`). Текущий код не критичен,
но стоит задокументировать порядок operations в `onComplete`.

---

### IN-02: `BOT_USERNAME` захардкожен в `OnboardingScreen.tsx`

**File:** `frontend/src/screens/OnboardingScreen.tsx:8`

**Issue:** `const BOT_USERNAME = 'tg_budget_planner_bot'` — значение захардкожено
в UI-коде. В CLAUDE.md указано, что `settings.BOT_USERNAME` существует на
бэкенде. Если username бота сменится (переименование в BotFather), нужна
правка в двух местах. Комментарий в коде упоминает это (`// matches
settings.BOT_USERNAME default`), но не закрывает risk мисматча.

**Fix:** Добавить `bot_username` в ответ `GET /me` или отдельный endpoint
`GET /settings`, чтобы frontend получал имя бота из конфига. Либо вынести
в `VITE_BOT_USERNAME` env-переменную.

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| Critical | 0 | — |
| Warning  | 4 | WR-01 (upsert not guarded → silent rollback risk), WR-02 (redundant router-level `Depends(get_current_user)`), WR-03 (missing `@pytest.mark.asyncio` on Phase 14 bot test), WR-04 (unused `bot_resolve_user_role` import) |
| Info     | 2 | IN-01 (pendingOnboarding semantic vs refetch), IN-02 (hardcoded BOT_USERNAME) |

**Наиболее важные для исправления до мержа:** WR-01 (риск rollback всего onboarding при DB-ошибке в цикле upsert) и WR-03 (Phase 14 MTONB-01 критерий приёмки де-факто не выполняется в CI).

---

_Reviewed: 2026-05-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
