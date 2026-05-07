---
plan: 14-04-bot-start-branch
phase: 14
status: complete
requirements: [MTONB-01]
duration_min: 8
commits: 1
---

# Plan 14-04 — Bot /start branch on onboarded_at (MTONB-01)

## Цель
Реализовать ветку приветствия бота для приглашённого юзера, у которого `app_user.onboarded_at IS NULL`. Различать «уже настроен» (обычное приветствие) от «приглашён, ждёт onboarding» (invite-flow copy + WebApp button).

## Что сделано

### `app/bot/auth.py`
- Добавлен `bot_resolve_user_status(tg_user_id) -> tuple[UserRole | None, datetime | None]` — single SELECT возвращает `(role, onboarded_at)`.
- Существующий `bot_resolve_user_role` сохранён без изменений (используется в `app/bot/commands.py` для `/add`, `/balance`, `/today`).
- Тот же threat-model паттерн (fresh SELECT per command, no cache, T-12-04-01..04).

### `app/bot/handlers.py`
- `cmd_start` теперь резолвит `(role, onboarded_at)` через `bot_resolve_user_status`.
- Если `role IN (owner, member)` AND `onboarded_at IS NULL` → отдельный greeting:
  > «Добро пожаловать! Откройте приложение и пройдите настройку — это займёт минуту.»
  + InlineKeyboardButton(WebApp). Логирование `bot.start.invite_pending` со структурными полями.
- Owner всегда onboarded (backfill в migration 0006), поэтому ветка не задевает существующих юзеров.
- Существующие три ветки (deep-link `?start=onboard`, обычная, degraded после InternalApiError) сохранены.

### `tests/test_bot_handlers.py`
- 4 существующих теста (`test_cmd_start_rejects_non_owner`, `_owner_calls_bind_…`, `_handles_internal_api_error_gracefully`, `_parses_onboard_payload`) переключены на `bot_resolve_user_status` mock — возвращают `(role, datetime)` для onboarded и `(role, None)` для revoked.
- RED-тест из 14-01 `test_cmd_start_member_not_onboarded_uses_invite_copy` теперь GREEN (handler читает `onboarded_at` из statused call).
- Итог: **9/9 GREEN**, 0 регрессий.

## Отклонения от плана
- **Реализован inline на master**, не через worktree-agent. Ранее запущенный async worktree-agent (a5f05898262a54042) был создан harness'ом из pre-Phase-11 коммита `f86643f`, что привело бы к 62k-строковому revert при merge (потеря Phase 11/12/13). Worktree удалён, изменения применены руками на master с теми же contractами и тестами, что и worktree готовил.

## Acceptance Criteria
- [x] `bot_resolve_user_status` существует и возвращает `(role, onboarded_at)` за один SELECT.
- [x] `cmd_start` использует `bot_resolve_user_status` (grep подтверждает).
- [x] Member с `onboarded_at IS NULL` получает invite-copy «Откройте приложение и пройдите настройку».
- [x] Onboarded юзер (owner или member с `onboarded_at IS NOT NULL`) получает существующий greeting.
- [x] WebApp button присутствует во всех трёх ветках.
- [x] All 9 tests pass: `.venv-test/bin/python -m pytest tests/test_bot_handlers.py -q` → `9 passed`.

## Связи
- MTONB-01 (REQUIREMENTS.md) — реализовано.
- D-14-02 (CONTEXT.md, Bot `/start` for member) — реализовано.
- Не зависит от 14-02 (router gate) и 14-03 (embedding backfill); зависит от 14-01 (RED test).
