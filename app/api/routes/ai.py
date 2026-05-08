"""REST эндпоинты Phase 9 AI Assistant (AI-03, AI-06, AI-09, AI-10).

Endpoints:
- POST /ai/chat — SSE streaming chat с tool-use (AI-03)
- GET /ai/history — история разговора (AI-06)
- DELETE /ai/conversation — очистка истории (AI-06)
- GET /ai/usage — token usage and estimated USD cost (Phase 10.1)

Auth: router-level Depends(get_current_user).
Rate limit: in-memory sliding window 10 req/мин (Phase 10.1, lowered
from 30 for cost-control ceiling).
OPENAI_API_KEY: только в backend ENV (AI-09).

Phase 11 (Plan 11-06): handlers используют ``get_db_with_tenant_scope`` +
``get_current_user_id``; AiConversation и AiMessage scoped по user_id;
tool-функции получают user_id через kwargs из dispatch-цикла.
"""
from __future__ import annotations

import json
import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Annotated, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from pydantic import ValidationError

from app.ai.llm_client import get_llm_client
from app.ai.providers.openai_provider import humanize_provider_error
from app.ai.system_prompt import build_messages
from app.ai.tool_args import TOOL_ARGS_MODELS, humanize_tool_args_error
from app.ai.tools import TOOL_FUNCTIONS, TOOLS_SCHEMA
from app.services.spend_cap import acquire_user_spend_lock
from app.api.dependencies import (
    enforce_spending_cap,           # Plan 15-03 AICAP-02
    enforce_spending_cap_for_user,  # Plan 16-07 CON-02 (in-lock re-check)
    get_current_user,
    get_current_user_id,
    get_db_with_tenant_scope,
    require_onboarded,
)
from app.api.schemas.ai import (
    ChatHistoryResponse,
    ChatMessageRead,
    ChatRequest,
    UsageResponse,
)
from app.core.settings import settings
from app.db.models import AiUsageLog
from app.db.session import AsyncSessionLocal
from app.services import ai_conversation_service as conv_svc

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ai",
    tags=["ai"],
    dependencies=[
        Depends(get_current_user),
        Depends(require_onboarded),
        Depends(enforce_spending_cap),   # Plan 15-03 AICAP-02
    ],
)

# ---- Rate limiter (in-memory, per-process) — Phase 10.1: 30 → 10 ----
_rate_buckets: dict[int, list[float]] = defaultdict(list)
_RATE_LIMIT = 10
_RATE_WINDOW = 60.0

# ---- Usage ring buffer (in-memory, per-process) — Phase 10.1 ----
# Stores last N usage records for the /ai/usage dashboard endpoint.
# Per-process scope is acceptable for single-tenant pet app.
_USAGE_BUFFER_MAX = 1000
_usage_buffer: deque[dict] = deque(maxlen=_USAGE_BUFFER_MAX)


async def _record_usage(
    usage: dict,
    *,
    user_id: int | None = None,
    session_factory: "async_sessionmaker[AsyncSession] | None" = None,
) -> None:
    """Append a usage record + log line + persist to ai_usage_log table.

    Phase 13 (Plan 13-03): persistent per-user storage backing the admin
    ``GET /admin/ai-usage`` breakdown (AIUSE-02). The existing in-memory
    ring buffer is preserved for the legacy ``/ai/usage`` dashboard
    endpoint.

    Args:
        usage: dict with model + token counts + est_cost_usd (LLM event).
        user_id: app_user.id of the requestor. ``None`` or ``0`` skips the
            DB insert (defensive — should never happen on the live SSE
            path because user_id comes from ``get_current_user_id``).
        session_factory: ``async_sessionmaker`` to open a short-lived
            INSERT transaction. ``None`` skips the DB insert (used by
            tests / sites without a session).

    DB failures are caught and logged as
    ``ai.usage_log_persist_failed`` so a broken DB does NOT break the
    SSE event stream — telemetry must never be a hard dependency of the
    user-facing chat path.
    """
    record = {**usage, "ts": datetime.now(timezone.utc).isoformat()}
    _usage_buffer.append(record)
    logger.info(
        "ai.usage model=%s prompt=%d cached=%d completion=%d total=%d est_usd=%.6f",
        usage.get("model"),
        usage.get("prompt_tokens", 0),
        usage.get("cached_tokens", 0),
        usage.get("completion_tokens", 0),
        usage.get("total_tokens", 0),
        usage.get("est_cost_usd", 0.0),
    )

    # ---- Phase 13 AIUSE-02: persist to ai_usage_log ----
    if not user_id or session_factory is None:
        return
    try:
        async with session_factory() as session:
            row = AiUsageLog(
                user_id=user_id,
                model=str(usage.get("model") or "unknown"),
                prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
                completion_tokens=int(usage.get("completion_tokens", 0) or 0),
                cached_tokens=int(usage.get("cached_tokens", 0) or 0),
                total_tokens=int(usage.get("total_tokens", 0) or 0),
                est_cost_usd=float(usage.get("est_cost_usd", 0.0) or 0.0),
            )
            session.add(row)
            await session.commit()
    except Exception as exc:  # noqa: BLE001 — telemetry must not break SSE
        logger.warning(
            "ai.usage_log_persist_failed user_id=%s model=%s err=%s",
            user_id,
            usage.get("model"),
            exc,
        )


def _is_rate_limited(rate_key: int) -> bool:
    """Sliding window rate limiter. Возвращает True если лимит превышен.

    rate_key: целочисленный идентификатор для bucket (Phase 11: app_user.id).
    """
    now = time.monotonic()
    bucket = _rate_buckets[rate_key]
    # Очистить устаревшие записи
    _rate_buckets[rate_key] = [t for t in bucket if now - t < _RATE_WINDOW]
    if len(_rate_buckets[rate_key]) >= _RATE_LIMIT:
        return True
    _rate_buckets[rate_key].append(now)
    return False


def _get_llm_client():
    """Фабрика LLM-клиента — отдельная функция для monkeypatching в тестах."""
    return get_llm_client()


async def _event_stream(
    db: AsyncSession,
    user_id: int,
    message: str,
) -> AsyncGenerator[str, None]:
    """Генератор SSE-событий для POST /ai/chat.

    Phase 11: user_id — это app_user.id (PK) из get_current_user_id; используется
    для conversation scope и для проброса в tool-функции.

    Протокол:
    1. Получить/создать conversation (per-user)
    2. Сохранить user message в БД (с user_id)
    3. Получить историю (последние AI_MAX_CONTEXT_MESSAGES)
    4. Собрать messages с system prompt (cache_control)
    5. Стримить события от LLM
    6. Обработать tool_call_complete → вызвать tool с user_id → добавить tool result
    7. Продолжить стриминг с tool result
    8. Сохранить assistant response в БД
    9. Отправить done
    """
    try:
        # 1. Conversation persistence (scoped по user_id).
        conv = await conv_svc.get_or_create_conversation(db, user_id=user_id)
        await conv_svc.append_message(
            db, conv.id, user_id=user_id, role="user", content=message
        )
        await db.flush()

        # 2. История для LLM-контекста.
        # Принципы реконструкции:
        # - user / assistant с непустым content попадают как есть.
        # - Пустые assistant-плейсхолдеры (промежуточный шаг до tool call)
        #   не передаём — LLM это шум.
        # - Каждое сохранённое tool-сообщение разворачиваем в правильную
        #   пару OpenAI-формата:
        #     {role: assistant, content: null, tool_calls: [{id, function}]}
        #     {role: tool, tool_call_id, content: tool_result}
        #   tool_call_id у нас в БД не лежит — генерируем синтетический
        #   (OpenAI не валидирует структуру id, важен только match между
        #   двумя сообщениями). Без этого LLM на следующем turn'е теряет
        #   фактические числа из tool-результата и начинает противоречить
        #   собственному предыдущему ответу ("242 630 рублей" → "у меня
        #   нет данных о вашем доходе").
        history_msgs = await conv_svc.get_recent_messages(
            db, conv.id, user_id=user_id, limit=settings.AI_MAX_CONTEXT_MESSAGES
        )
        history_dicts: list[dict] = []
        synth_id = 0
        for m in history_msgs[:-1]:  # exclude only-just-added user message
            if m.role == "user" and (m.content or "").strip():
                history_dicts.append({"role": "user", "content": m.content})
            elif m.role == "assistant" and (m.content or "").strip():
                history_dicts.append({"role": "assistant", "content": m.content})
            elif m.role == "tool" and m.tool_name and (m.tool_result or "").strip():
                synth_id += 1
                call_id = f"reconstructed_{synth_id}"
                history_dicts.append(
                    {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": call_id,
                                "type": "function",
                                "function": {
                                    "name": m.tool_name,
                                    "arguments": "{}",
                                },
                            }
                        ],
                    }
                )
                history_dicts.append(
                    {
                        "role": "tool",
                        "tool_call_id": call_id,
                        "content": m.tool_result,
                    }
                )

        # 3. Собрать messages с system prompt
        llm_messages = build_messages(history_dicts, message)

        # 4. Agent loop. На каждом раунде LLM может либо вернуть текст
        # (финал), либо запросить один-несколько tool-вызовов; во втором
        # случае выполняем их все, добавляем результаты в payload и
        # повторяем до текстового ответа или MAX_ROUNDS.
        client = _get_llm_client()
        assistant_content_parts: list[str] = []
        max_rounds = 5

        # AI-03 (Plan 16-05): tool-loop guard. Hardcap total tool-fn
        # executions per session at MAX_TOTAL_TOOL_CALLS (D-16-06). Counter
        # is incremented AFTER args validation, BEFORE tool_fn() — so
        # bad-args paths (Plan 16-04 tool_error branch) do not consume the
        # budget. Repeat-detection compares signatures across the
        # immediately-previous round only (frozenset of hashable kwargs).
        # On break we yield a fallback assistant message + done event so
        # the UI sees a graceful close instead of a stalled stream.
        MAX_TOTAL_TOOL_CALLS = 8
        tool_call_count = 0
        prev_round_signatures: set[tuple[str, frozenset]] = set()
        loop_aborted = False

        for _round in range(max_rounds):
            tool_calls_this_round: list[dict] = []
            text_this_round: list[str] = []
            errored = False
            current_round_signatures: set[tuple[str, frozenset]] = set()

            async for event in client.chat(llm_messages, tools=TOOLS_SCHEMA):
                etype = event.get("type", "")
                if etype == "token":
                    text_this_round.append(event["data"])
                    yield f"data: {json.dumps({'type': 'token', 'data': event['data']})}\n\n"
                elif etype == "usage":
                    # Phase 13: pass user_id + session factory so the hook can
                    # persist to ai_usage_log (Plan 13-03). Failure is swallowed
                    # inside the hook — telemetry must not break the SSE stream.
                    await _record_usage(
                        event["data"],
                        user_id=user_id,
                        session_factory=AsyncSessionLocal,
                    )
                elif etype == "tool_start":
                    yield f"data: {json.dumps({'type': 'tool_start', 'data': event['data']})}\n\n"
                elif etype == "tool_call_complete":
                    # Накапливаем ВСЕ tool calls этого раунда — модель
                    # может запросить несколько параллельно.
                    tool_calls_this_round.append(json.loads(event["data"]))
                elif etype == "done":
                    break
                elif etype == "error":
                    # SEC-02 (Plan 16-02): event['data'] from openai_provider
                    # already passed through humanize_provider_error. Defense-
                    # in-depth: still treat as untrusted text — coerce to str
                    # and fall back to generic constant if missing/empty so a
                    # provider regression cannot leak raw exception text here.
                    safe_data = str(event.get("data") or "").strip() or (
                        "Не удалось получить ответ от AI. Попробуй позже."
                    )
                    yield f"data: {json.dumps({'type': 'error', 'data': safe_data})}\n\n"
                    errored = True
                    break

            if errored:
                return

            assistant_content_parts.extend(text_this_round)

            # Нет вызовов инструментов — это финальный ответ модели.
            if not tool_calls_this_round:
                break

            # Иначе: добавить assistant.tool_calls в context, выполнить
            # каждый tool, добавить tool-result для каждого, ещё раунд.
            llm_messages.append(
                {
                    "role": "assistant",
                    "content": "".join(text_this_round) or None,
                    "tool_calls": [
                        {
                            "id": tc.get("id", ""),
                            "type": "function",
                            "function": {
                                "name": tc.get("name", ""),
                                "arguments": tc.get("arguments", "{}") or "{}",
                            },
                        }
                        for tc in tool_calls_this_round
                    ],
                }
            )

            for tc in tool_calls_this_round:
                tool_name = tc.get("name", "")
                raw_args = tc.get("arguments", "{}") or "{}"

                # AI-02 (Plan 16-04): strict tool-args validation via Pydantic.
                # Bad JSON or wrong types → SSE tool_error event +
                # logger.warning("ai.tool_args_invalid"). No more silent
                # empty-dict fallback (which let TypeError bubble up later).
                args_model_cls = TOOL_ARGS_MODELS.get(tool_name)
                parsed_kwargs: dict | None = None
                args_error: Exception | None = None
                try:
                    raw_kwargs = json.loads(raw_args)
                    if not isinstance(raw_kwargs, dict):
                        raise ValueError(
                            f"tool args must be a JSON object, got "
                            f"{type(raw_kwargs).__name__}"
                        )
                    if args_model_cls is None:
                        # Unknown tool — fall through to "tool not found"
                        # branch below; preserve raw kwargs.
                        parsed_kwargs = raw_kwargs
                    else:
                        # Phase 11: never let LLM override user_id scope.
                        raw_kwargs.pop("user_id", None)
                        model = args_model_cls.model_validate(raw_kwargs)
                        parsed_kwargs = model.model_dump(exclude_none=True)
                except (json.JSONDecodeError, ValidationError, ValueError) as exc:
                    args_error = exc

                if args_error is not None:
                    # T-16-04-02: log structured err details (Pydantic
                    # ``.errors()`` for ValidationError, str() otherwise).
                    # Truncate raw args to 200 chars to bound any LLM-
                    # controllable PII in audit log.
                    logger.warning(
                        "ai.tool_args_invalid tool=%s err_type=%s err=%s raw_args=%.200s",
                        tool_name,
                        type(args_error).__name__,
                        args_error,
                        raw_args,
                    )
                    human_msg = humanize_tool_args_error(tool_name, args_error)
                    yield (
                        "data: "
                        + json.dumps(
                            {
                                "type": "tool_error",
                                "data": {
                                    "tool": tool_name,
                                    "message": human_msg,
                                },
                            },
                            ensure_ascii=False,
                        )
                        + "\n\n"
                    )
                    # Feed a synthetic tool result back to the LLM so it can
                    # recover gracefully (or finish with a user-friendly
                    # text). Preserves the OpenAI message-pair invariant
                    # (assistant.tool_calls must be followed by tool messages
                    # with matching tool_call_id, otherwise the next turn
                    # 400-errors).
                    synth_result = {"error": human_msg}
                    synth_result_str = json.dumps(synth_result, ensure_ascii=False)
                    await conv_svc.append_message(
                        db,
                        conv.id,
                        user_id=user_id,
                        role="tool",
                        tool_name=tool_name,
                        tool_result=synth_result_str,
                    )
                    llm_messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.get("id", ""),
                            "content": synth_result_str,
                        }
                    )
                    continue  # skip tool execution

                # AI-03 guard (Plan 16-05): hardcap total tool calls +
                # adjacent-round repeat detect. Runs AFTER successful args
                # validation and BEFORE tool_fn() so the synthetic
                # tool_error path above doesn't drain the budget.
                try:
                    sig_kwargs = frozenset(
                        (k, v) for k, v in (parsed_kwargs or {}).items()
                        if not isinstance(v, (list, dict, set))
                    )
                except TypeError:
                    # Unhashable values (e.g. nested objects): skip dedup
                    # for this signature but keep enforcing the hardcap.
                    sig_kwargs = frozenset()
                signature = (tool_name, sig_kwargs)

                if signature in prev_round_signatures:
                    logger.warning(
                        "ai.tool_loop_repeat tool=%s args=%s round=%d",
                        tool_name, sig_kwargs, _round,
                    )
                    loop_aborted = True
                    break

                if tool_call_count >= MAX_TOTAL_TOOL_CALLS:
                    logger.warning(
                        "ai.tool_loop_hardcap tool=%s count=%d cap=%d",
                        tool_name, tool_call_count, MAX_TOTAL_TOOL_CALLS,
                    )
                    loop_aborted = True
                    break

                current_round_signatures.add(signature)
                tool_call_count += 1

                tool_fn = TOOL_FUNCTIONS.get(tool_name)
                if tool_fn:
                    # parsed_kwargs already had user_id stripped above.
                    tool_result = await tool_fn(db, user_id=user_id, **parsed_kwargs)
                else:
                    tool_result = {"error": f"Неизвестный инструмент: {tool_name}"}

                # Proposal-tool: surface payload to frontend as a dedicated
                # SSE event so it can open a prefilled bottom-sheet for the
                # user to review/edit/approve. The same payload still goes
                # back to the LLM as the tool result (so the model can
                # acknowledge "подготовил, проверь форму") but with the
                # internal _proposal flag stripped to keep its context tidy.
                proposal_short_circuit = False
                if isinstance(tool_result, dict) and tool_result.get("_proposal"):
                    yield (
                        "data: "
                        + json.dumps(
                            {"type": "propose", "data": tool_result},
                            ensure_ascii=False,
                            default=str,
                        )
                        + "\n\n"
                    )
                    proposal_short_circuit = True

                tool_result_str = json.dumps(
                    tool_result, ensure_ascii=False, default=str
                )

                await conv_svc.append_message(
                    db,
                    conv.id,
                    user_id=user_id,
                    role="tool",
                    tool_name=tool_name,
                    tool_result=tool_result_str,
                )

                llm_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.get("id", ""),
                        "content": tool_result_str,
                    }
                )

            # AI-03 (Plan 16-05): roll the per-round signature set forward
            # so the next round can detect an immediately-adjacent repeat.
            # If the inner loop broke via loop_aborted, exit the outer
            # agent-loop too — fallback message is yielded below.
            prev_round_signatures = current_round_signatures
            if loop_aborted:
                break

            yield f"data: {json.dumps({'type': 'tool_end', 'data': ''})}\n\n"

            # Latency optimisation: when the round produced a propose-event,
            # skip the second OpenAI round-trip (which would just generate the
            # canned "Подготовил трату, проверь и подтверди." text per system
            # prompt) and yield the same string ourselves. Saves ~600-1000ms
            # of model time per proposal — the user sees the bottom-sheet
            # already; the model has nothing useful left to add.
            if proposal_short_circuit:
                kind_of = (
                    tool_result.get("kind_of")
                    if isinstance(tool_result, dict) else None
                )
                fixed_text = (
                    "Подготовил план, проверь и подтверди."
                    if kind_of == "planned"
                    else "Подготовил трату, проверь и подтверди."
                )
                assistant_content_parts.append(fixed_text)
                yield (
                    "data: "
                    + json.dumps(
                        {"type": "token", "data": fixed_text},
                        ensure_ascii=False,
                    )
                    + "\n\n"
                )
                break  # exit the agent-loop — no follow-up round needed

        # AI-03 (Plan 16-05): graceful close if the loop guard tripped —
        # yield user-friendly fallback assistant message + done event so
        # the frontend reducer treats this as a normal completion (not an
        # error / not a stalled stream).
        if loop_aborted:
            fallback = "Не удалось завершить, переформулируй запрос."
            await conv_svc.append_message(
                db, conv.id, user_id=user_id, role="assistant", content=fallback,
            )
            await db.flush()
            yield (
                "data: "
                + json.dumps({"type": "token", "data": fallback}, ensure_ascii=False)
                + "\n\n"
            )
            yield "data: " + json.dumps({"type": "done", "data": ""}) + "\n\n"
            return

        # 5. Persist финального assistant-ответа.
        full_response = "".join(assistant_content_parts)
        if full_response:
            await conv_svc.append_message(
                db, conv.id, user_id=user_id, role="assistant", content=full_response
            )
        await db.flush()
        yield f"data: {json.dumps({'type': 'done', 'data': ''})}\n\n"

    except Exception as exc:
        # SEC-02 (Plan 16-02): NEVER leak str(exc) to the SSE client — class
        # names, file paths, SQL fragments and raw API keys can show up in
        # exception text and were rendered into ChatMessage via
        # dangerouslySetInnerHTML (compounding SEC-01 XSS surface).
        # Full traceback is captured by logger.exception for ops/debug only.
        logger.exception("ai.event_stream_failed user_id=%s", user_id)
        safe_msg = humanize_provider_error(exc)
        yield f"data: {json.dumps({'type': 'error', 'data': safe_msg})}\n\n"


@router.post("/chat")
async def chat(
    body: ChatRequest,
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> StreamingResponse:
    """POST /ai/chat — streaming SSE ответ (AI-03).

    Phase 11: rate-limit bucket key — app_user.id (PK), не tg_user_id.
    Rate limit: 10 req/мин → 429 + Retry-After (AI-10).

    CON-02 (Plan 16-07): around the ENTIRE stream we hold a per-user
    asyncio.Lock so the "check spend → call LLM → record_usage" sequence
    is serialised on a per-user basis. Two concurrent /ai/chat requests
    for the same user that both pass the router-level
    ``enforce_spending_cap`` (cached spend < cap) will queue here; the
    second request re-reads spend from DB after the first's
    ``_record_usage`` INSERT lands, picking up the fresh value via
    ``enforce_spending_cap_for_user`` and 429-ing if cap is now reached.

    Different users do NOT block each other — locks are keyed per
    ``user_id`` (see ``_user_locks`` in app/services/spend_cap.py).
    """
    if _is_rate_limited(user_id):
        raise HTTPException(
            status_code=429,
            detail="Превышен лимит запросов. Попробуй через минуту.",
            headers={"Retry-After": "60"},
        )

    # CON-02: per-user lock around the entire stream lifecycle.
    # _event_stream calls _record_usage as part of its `usage` event handling;
    # the lock is held until the stream generator finishes (incl. _record_usage).
    lock = await acquire_user_spend_lock(user_id)
    await lock.acquire()
    try:
        # In-lock re-check: serialises against any earlier in-flight request
        # that just finished _record_usage and released the lock. Cheap when
        # cap not configured (returns None).
        await enforce_spending_cap_for_user(db, user_id=user_id)

        async def _wrapped() -> AsyncGenerator[str, None]:
            try:
                async for chunk in _event_stream(db, user_id, body.message):
                    yield chunk
            finally:
                # Always release — even on generator close / client disconnect
                # / mid-stream exception. Lock is per-user so leaving it held
                # would block all subsequent requests for THIS user.
                if lock.locked():
                    lock.release()

        return StreamingResponse(
            _wrapped(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
    except BaseException:
        # If anything between acquire and StreamingResponse construction
        # throws (incl. enforce_spending_cap_for_user → 429), release the
        # lock before re-raising. BaseException catches CancelledError too.
        if lock.locked():
            lock.release()
        raise


@router.get("/history", response_model=ChatHistoryResponse)
async def get_history(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> ChatHistoryResponse:
    """GET /ai/history — история разговора (AI-06).

    Phase 11: scoped по user_id — каждый user видит только свою историю.

    Возвращает только пользовательские и ассистент-сообщения с непустым
    текстом. Tool-сообщения и пустые assistant-плейсхолдеры (которые
    остаются в БД от tool-call round-trip) не показываются — иначе
    в UI рендерились бы пустые «bubble»-плашки.
    """
    conv = await conv_svc.get_or_create_conversation(db, user_id=user_id)
    msgs = await conv_svc.get_recent_messages(
        db, conv.id, user_id=user_id, limit=settings.AI_MAX_CONTEXT_MESSAGES
    )
    return ChatHistoryResponse(
        messages=[
            ChatMessageRead(
                id=m.id,
                role=m.role,
                content=m.content,
                tool_name=m.tool_name,
                created_at=m.created_at.isoformat(),
            )
            for m in msgs
            if m.role in ("user", "assistant") and (m.content or "").strip()
        ]
    )


@router.delete("/conversation", status_code=204)
async def clear_conversation(
    db: Annotated[AsyncSession, Depends(get_db_with_tenant_scope)],
    user_id: Annotated[int, Depends(get_current_user_id)],
) -> None:
    """DELETE /ai/conversation — очистить историю разговора (AI-06).

    Phase 11: scoped по user_id.
    """
    conv = await conv_svc.get_or_create_conversation(db, user_id=user_id)
    await conv_svc.clear_conversation(db, conv.id, user_id=user_id)


@router.get("/usage", response_model=UsageResponse)
async def get_usage() -> UsageResponse:
    """GET /ai/usage — token usage and estimated USD cost (Phase 10.1).

    Aggregates the in-process ring buffer into today / total session totals.
    Per-process scope: stats reset on api container restart. Acceptable for
    a single-tenant pet app; promote to DB if cross-process visibility needed.
    """
    today = datetime.now(timezone.utc).date().isoformat()
    today_records = [r for r in _usage_buffer if r["ts"][:10] == today]

    def _agg(records: list[dict]) -> dict:
        return {
            "requests": len(records),
            "prompt_tokens": sum(r.get("prompt_tokens", 0) for r in records),
            "completion_tokens": sum(r.get("completion_tokens", 0) for r in records),
            "cached_tokens": sum(r.get("cached_tokens", 0) for r in records),
            "total_tokens": sum(r.get("total_tokens", 0) for r in records),
            "est_cost_usd": round(
                sum(r.get("est_cost_usd", 0.0) for r in records), 6
            ),
        }

    return UsageResponse(
        today=_agg(today_records),
        session_total=_agg(list(_usage_buffer)),
        buffer_size=len(_usage_buffer),
        buffer_max=_USAGE_BUFFER_MAX,
    )
