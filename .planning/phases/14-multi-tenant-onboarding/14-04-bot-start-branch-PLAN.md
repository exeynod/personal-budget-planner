---
phase: 14-multi-tenant-onboarding
plan: 04
type: execute
wave: 1
depends_on: [01]
files_modified:
  - app/bot/auth.py
  - app/bot/handlers.py
autonomous: true
requirements: [MTONB-01]
must_haves:
  truths:
    - "/start from a member with onboarded_at IS NULL replies with the invite-flow text «Откройте приложение и пройдите настройку — это займёт минуту.» + WebApp button."
    - "/start from a member or owner with onboarded_at set continues to use the existing greeting (no behaviour change for already-onboarded users)."
    - "/start from a non-whitelisted user (revoked/unknown role) still replies «Бот приватный.» (no leak about onboarding state)."
    - "tg_chat_id binding via /internal/telegram/chat-bind still happens for both onboarded and not-onboarded members (so frontend can detect chat_id_known=true after first /start)."
  artifacts:
    - path: "app/bot/auth.py"
      provides: "bot_resolve_user_status(tg_user_id) -> tuple[UserRole | None, datetime | None]"
      contains: "async def bot_resolve_user_status"
    - path: "app/bot/handlers.py"
      provides: "cmd_start branching on (role, onboarded_at)"
      contains: "bot_resolve_user_status"
  key_links:
    - from: "app/bot/handlers.py:cmd_start"
      to: "app/bot/auth.py:bot_resolve_user_status"
      via: "(role, onboarded_at) tuple read at start of handler"
      pattern: "role, onboarded_at = await bot_resolve_user_status"
    - from: "app/bot/handlers.py:cmd_start"
      to: "MTONB-01 invite copy"
      via: "if onboarded_at is None: invite-flow greeting"
      pattern: "Откройте приложение и пройдите настройку"
---

<objective>
Implement MTONB-01 / D-14-02 — bot `/start` greeting branches on onboarded status. New helper `bot_resolve_user_status` returns `(role, onboarded_at)` in a single SELECT; `cmd_start` distinguishes "ready to use" (onboarded) from "needs to onboard" (`onboarded_at IS NULL`) and shows the invite-flow copy.

Purpose: A user who is invited via the Admin UI (Phase 13) lands on `/start` knowing nothing about Mini App onboarding. The bot must hand them a clear directive: open the Mini App and complete setup. Without this branch, they'd see the same "Бот запущен и готов к работе" copy that suggests everything works — then the Mini App would 409 them straight into onboarding.
Output: 1 new helper + branched `cmd_start` greeting; Plan 14-01 RED test for cmd_start turns GREEN.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/14-multi-tenant-onboarding/14-CONTEXT.md
@.planning/phases/12-role-based-auth-refactor/12-CONTEXT.md
@./CLAUDE.md

<interfaces>
From `app/bot/auth.py` (existing — DO NOT REMOVE; other callers depend):
```python
async def bot_resolve_user_role(tg_user_id: int) -> UserRole | None:
    """Used by Phase 12 for role-only checks. Keep intact."""
```
NEW sibling helper:
```python
async def bot_resolve_user_status(tg_user_id: int) -> tuple[UserRole | None, datetime | None]:
    """Single SELECT returning (role, onboarded_at)."""
```

From `app/bot/handlers.py:cmd_start` (current behaviour, to be refactored MINIMALLY):
- Reads role via `bot_resolve_user_role(user_id)` → rejects non-(owner|member).
- Calls `bind_chat_id(...)` (best-effort).
- Branches on `payload == "onboard"` and `chat_bound`.
- Replies with greeting + WebApp button.

After this plan: read `(role, onboarded_at)` instead, with the new branch:
- If role NOT IN (owner, member) → "Бот приватный." (UNCHANGED).
- If `onboarded_at is None` → invite-flow copy (NEW MTONB-01 branch).
- Else (already onboarded) → existing copy paths (`?start=onboard`, default, chat-bind-failed).

From `app/db/models.py`:
- `AppUser.role: Mapped[UserRole]`.
- `AppUser.onboarded_at: Mapped[Optional[datetime]]`.

Existing test pattern in `tests/test_bot_handlers.py`:
- `_make_message(user_id=..., chat_id=...)` returns a stubbed `Message` with `from_user`, `chat`, `answer` (AsyncMock).
- `_make_command(args=...)` returns a stubbed `CommandObject`.
- Tests patch `app.bot.handlers.bot_resolve_user_role` (will become `bot_resolve_user_status`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add bot_resolve_user_status helper to app/bot/auth.py</name>
  <files>app/bot/auth.py</files>
  <read_first>
    - app/bot/auth.py (full file — extend, do not rewrite; keep `bot_resolve_user_role`)
  </read_first>
  <behavior>
    - `bot_resolve_user_status(tg_user_id: int) -> tuple[UserRole | None, datetime | None]`:
      - Returns `(role, onboarded_at)` in a single SELECT (no extra round-trip).
      - When no AppUser row exists → returns `(None, None)`.
      - When AppUser exists with `onboarded_at IS NULL` → returns `(<role>, None)`.
      - Opens its own `AsyncSessionLocal()` (bot has separate event loop, can't reuse FastAPI session).
    - Existing `bot_resolve_user_role` MUST keep working unchanged for backward compat with other callers (`app/bot/commands.py` if any, plus existing tests).
  </behavior>
  <action>
    Append to `app/bot/auth.py` after `bot_resolve_user_role`:

    ```python
    from datetime import datetime  # add to existing imports if not already present


    async def bot_resolve_user_status(
        tg_user_id: int,
    ) -> tuple[UserRole | None, datetime | None]:
        """Return (role, onboarded_at) for a Telegram user (Phase 14 MTONB-01).

        Single SELECT — same DB pattern as bot_resolve_user_role. Used by
        ``cmd_start`` to distinguish "already onboarded" (regular greeting)
        from "invited but pending onboarding" (D-14-02 invite-flow copy).

        Args:
            tg_user_id: Telegram user id from the incoming message.

        Returns:
            (role, onboarded_at) tuple. Either or both elements can be None:
            - (None, None) when the AppUser row doesn't exist (revoked /
              non-whitelisted Telegram account — handler replies "Бот приватный").
            - (UserRole.<x>, None) when whitelisted but pre-onboarding
              (Phase 14 invite scenario).
            - (UserRole.<x>, <datetime>) when fully onboarded.

        Threat note: same fresh-SELECT-per-command guarantee as
        bot_resolve_user_role — revoked status and onboarded transitions
        propagate within one command turnaround (no caching).
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppUser.role, AppUser.onboarded_at)
                .where(AppUser.tg_user_id == tg_user_id)
            )
            row = result.first()
            if row is None:
                return (None, None)
            return (row.role, row.onboarded_at)
    ```

    Verify the existing `select` + `AppUser` + `AsyncSessionLocal` imports cover the new helper (they do — see top of file). Add `from datetime import datetime` if not imported (only used in the type hint).

    Update the module docstring (top of file) — append:
    ```
    Phase 14 (MTONB-01): bot_resolve_user_status sibling helper returns
    (role, onboarded_at) for the cmd_start branching logic — distinguishes
    "ready to use" from "invited, pending onboarding".
    ```
  </action>
  <verify>
    <automated>
    grep -c "async def bot_resolve_user_status" app/bot/auth.py | grep -q "^1$" &amp;&amp; \
    grep -c "async def bot_resolve_user_role" app/bot/auth.py | grep -q "^1$" &amp;&amp; \
    python -c "from app.bot.auth import bot_resolve_user_status, bot_resolve_user_role; assert callable(bot_resolve_user_status) and callable(bot_resolve_user_role)"
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "async def bot_resolve_user_status" app/bot/auth.py` == 1.
    - `grep -c "async def bot_resolve_user_role" app/bot/auth.py` == 1 (preserved).
    - `grep -c "AppUser.role, AppUser.onboarded_at" app/bot/auth.py` == 1 (single SELECT for both columns).
    - Existing `pytest tests/test_bot_role_resolution.py -x` passes (no regression on `bot_resolve_user_role`).
  </acceptance_criteria>
  <done>bot_resolve_user_status sibling helper available; bot_resolve_user_role intact.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Branch cmd_start on onboarded_at; add invite-flow greeting</name>
  <files>app/bot/handlers.py</files>
  <read_first>
    - app/bot/handlers.py (full file — replace single-line `bot_resolve_user_role` lookup with `bot_resolve_user_status`; add new branch)
    - tests/test_bot_handlers.py (full — confirm existing tests still mock `bot_resolve_user_role` OR have been updated by 14-01; if they patch `bot_resolve_user_role` they'll still pass since we only ADD a sibling import — but the production handler will call `bot_resolve_user_status`. Existing tests need to be updated.)
  </read_first>
  <behavior>
    Final greeting decision tree in `cmd_start`:
    1. `(role, onboarded_at)` not in (`(owner, *)`, `(member, *)`) → "Бот приватный."
    2. `onboarded_at is None` (member or owner who somehow lacks onboarded_at) → invite copy:
       `"Добро пожаловать! Откройте приложение и пройдите настройку — это займёт минуту."`
    3. Existing onboarded paths preserved unchanged:
       - `payload == "onboard"` → "Готово, push-уведомления включены.\nОткройте Mini App для настройки бюджета."
       - `chat_bound=False` → degraded copy.
       - Default → "Бот запущен и готов к работе.\nPush-уведомления включены — откройте Mini App, чтобы управлять бюджетом."

    `bind_chat_id` MUST run BEFORE the greeting decision regardless of onboarded status — invited members need their `tg_chat_id` saved (frontend OnboardingScreen polls /me and unblocks "Бот подключён" only after that).
  </behavior>
  <action>
    Edit `app/bot/handlers.py` `cmd_start` function. Two surgical changes:

    **Change 1 — Replace the import line and role lookup.**

    Before (line ~34):
    ```python
    from app.bot.auth import bot_resolve_user_role
    ```
    After:
    ```python
    from app.bot.auth import bot_resolve_user_role, bot_resolve_user_status
    ```
    Keep both imports — leave `bot_resolve_user_role` available for any other handlers (commands.py / admin commands).

    Before (lines ~60-70 in `cmd_start`):
    ```python
    role = await bot_resolve_user_role(user_id)
    if role not in (UserRole.owner, UserRole.member):
        await message.answer("Бот приватный.")
        logger.info(
            "bot.start.rejected",
            tg_user_id=user_id,
            role=role.value if role else None,
        )
        return
    ```
    After:
    ```python
    role, onboarded_at = await bot_resolve_user_status(user_id)
    if role not in (UserRole.owner, UserRole.member):
        await message.answer("Бот приватный.")
        logger.info(
            "bot.start.rejected",
            tg_user_id=user_id,
            role=role.value if role else None,
        )
        return
    ```

    **Change 2 — Insert MTONB-01 branch BEFORE the existing payload/chat_bound dispatcher.**

    After the `bind_chat_id` try/except block (where `chat_bound` is set), insert:

    ```python
    # Phase 14 MTONB-01 / D-14-02: invited members (and any whitelisted
    # user with onboarded_at IS NULL) get a directive to complete setup
    # in the Mini App. We do not branch on chat_bound here because the
    # frontend OnboardingScreen polls /me and shows the bind status itself.
    if onboarded_at is None:
        greeting = (
            "Добро пожаловать! "
            "Откройте приложение и пройдите настройку — это займёт минуту."
        )
        await message.answer(greeting, reply_markup=_open_app_keyboard())
        logger.info(
            "bot.start.invite_pending",
            tg_user_id=user_id,
            tg_chat_id=chat_id,
            chat_bound=chat_bound,
            role=role.value,
        )
        return

    # ... existing code: payload == "onboard" / chat_bound / default branches ...
    ```

    Leave the existing `if payload == "onboard": ... elif chat_bound: ... else: ...` block UNCHANGED — onboarded users hit it as before.

    **Change 3 — Update existing tests in `tests/test_bot_handlers.py` that patch `bot_resolve_user_role`.**

    Existing tests in this file likely look like `with patch.object(handlers, "bot_resolve_user_role", new=AsyncMock(return_value=UserRole.owner)):`. After our change, the handler calls `bot_resolve_user_status`, so those patches won't intercept. Update each patched line to match. Pattern:
    - Owner-allowed paths → patch `bot_resolve_user_status` returning `(UserRole.owner, datetime.now(timezone.utc))` so the existing onboarded greeting paths fire.
    - Member-allowed paths → patch `bot_resolve_user_status` returning `(UserRole.member, datetime.now(timezone.utc))`.
    - Rejection paths → patch returning `(None, None)` or `(UserRole.revoked, None)`.

    Step-by-step:
    1. `grep -n "bot_resolve_user_role" tests/test_bot_handlers.py` — list every patch site.
    2. For each, update to `bot_resolve_user_status` and provide a 2-tuple return.
    3. Add `from datetime import datetime, timezone` to test file imports if missing.
    4. Run `pytest tests/test_bot_handlers.py -x` — every test (including the new MTONB-01 one) MUST pass.

    Caveat: the helper module `app/bot/auth.py` STILL exports `bot_resolve_user_role` (preserved by 14-04 Task 1) — do NOT delete that reference; just re-point handler patches to the new helper.
  </action>
  <verify>
    <automated>
    pytest tests/test_bot_handlers.py -x --no-header 2>&1 | tail -5 &amp;&amp; \
    grep -c "bot_resolve_user_status" app/bot/handlers.py | grep -q "^[1-9]$" &amp;&amp; \
    grep -c "Откройте приложение и пройдите настройку" app/bot/handlers.py | grep -q "^1$"
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "bot_resolve_user_status" app/bot/handlers.py` ≥ 2 (import + one call).
    - `grep -c "Откройте приложение и пройдите настройку" app/bot/handlers.py` == 1 (exact MTONB-01 copy).
    - `grep -c "bot.start.invite_pending" app/bot/handlers.py` == 1 (new structured log event).
    - `pytest tests/test_bot_handlers.py -x` — all tests including `test_cmd_start_member_not_onboarded_uses_invite_copy` pass.
    - `pytest tests/test_bot_role_resolution.py -x` — passes (bot_resolve_user_role still callable).
    - `pytest tests/test_bot_handlers_phase4.py -x` — passes (no regression on actual-flow handlers).
  </acceptance_criteria>
  <done>cmd_start branches on onboarded_at; MTONB-01 invite copy reaches not-onboarded members; existing tests updated and GREEN.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Telegram → bot (long-poll) | aiogram receives the message; tg_user_id is from validated Telegram payload. |
| bot → Postgres (direct) | `bot_resolve_user_status` runs `SELECT role, onboarded_at WHERE tg_user_id=...` via shared async pool. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-14-04-01 | Information disclosure | Different copy reveals "your account exists but isn't onboarded" vs "your account doesn't exist" | accept | Same exposure as Phase 12 — the difference between "Бот приватный" and any greeting already leaks AppUser existence. The new copy adds no new bit. |
| T-14-04-02 | Spoofing | Telegram payload tampered to claim a different `tg_user_id` | mitigate (existing) | Telegram delivers messages signed by Telegram; bot trusts BOT_TOKEN. No new surface. |
| T-14-04-03 | Tampering | Race: user revoked between `bot_resolve_user_status` and the greeting reply | accept | Window is sub-millisecond; next /start command (or any API call) re-checks role and returns 403 / 409. Phase 12 T-12-04-01 covers the same accept rationale. |
| T-14-04-04 | Denial of service | Member spamming /start to keep onboarded_at NULL row hot | accept | Each /start = 1 SELECT + 1 internal POST + 1 reply. Existing rate limits on Telegram side cover. |
</threat_model>

<verification>
- `pytest tests/test_bot_handlers.py -x` — all GREEN (including new MTONB-01 test).
- `pytest tests/test_bot_handlers_phase4.py -x` — GREEN (no regression on /add /balance /today commands).
- `pytest tests/test_bot_role_resolution.py -x` — GREEN.
- `grep -c "bot_resolve_user_status" app/bot/handlers.py` ≥ 2.
- `grep -c "bot_resolve_user_role" app/bot/auth.py` == 1 (existing helper preserved).
</verification>

<success_criteria>
- New helper `bot_resolve_user_status` available; legacy `bot_resolve_user_role` preserved.
- `cmd_start` branches on `onboarded_at IS None`.
- Invite-flow copy "Откройте приложение и пройдите настройку — это займёт минуту." reaches not-onboarded members.
- Onboarded users see no behaviour change.
- Bot test suite GREEN with no regressions; the RED MTONB-01 test from 14-01 turns GREEN.
</success_criteria>

<output>
After completion, create `.planning/phases/14-multi-tenant-onboarding/14-04-SUMMARY.md`.
</output>
