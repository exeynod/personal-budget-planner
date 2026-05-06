"""aiogram command handlers — Phase 4 (ACT-03, ACT-04, ACT-05).

5 bot commands: /add, /income, /balance, /today, /app.
1 callback handler: cb_disambiguation for inline-keyboard category selection.

OWNER-only enforcement (Phase 1 → Phase 12 refactored): all handlers
silently return (no message.answer) for non-whitelisted users (role NOT
IN (owner, member)) to avoid spam and information disclosure (T-04-30,
T-04-37). Phase 12 introduced role-based check via bot_resolve_user_role.

Disambiguation flow (D-47, D-48):
  /add → ambiguous response → inline keyboard with act:TOKEN:CATEGORY_ID buttons
  → user taps → cb_disambiguation pops PendingActual → re-calls internal API
  with explicit category_id → formats and sends reply.

ALL handlers catch InternalApiError and respond gracefully (no raw exception
text is forwarded to the user; token/secret is never logged in messages).
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import structlog
from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

from app.bot.api_client import (
    InternalApiError,
    bot_create_actual,
    bot_get_balance,
    bot_get_today,
)
from app.bot.auth import bot_resolve_user_role
from app.bot.disambiguation import PendingActual, pop_pending, store_pending
from app.bot.parsers import parse_add_command
from app.core.settings import settings
from app.db.models import UserRole


logger = structlog.get_logger(__name__)
router = Router()


# ---------------------------------------------------------------------------
# Money formatting helpers (D-60 formats)
# ---------------------------------------------------------------------------


def format_kopecks(cents: int) -> str:
    """Format kopecks as Russian-style rubles with thousands separator.

    Examples: 150000 → "1 500", 0 → "0", 150050 → "1 500,50".
    No ₽ suffix — callers append as needed.
    """
    if cents % 100 == 0:
        rubles = cents // 100
        return f"{rubles:,}".replace(",", " ")
    rubles, kop = divmod(cents, 100)
    return f"{rubles:,}".replace(",", " ") + f",{kop:02d}"


def format_kopecks_with_sign(cents: int) -> str:
    """Format kopecks with explicit + or - sign and ₽ suffix.

    Examples: 150000 → "+1 500 ₽", -150000 → "-1 500 ₽", 0 → "0 ₽".
    """
    if cents == 0:
        return "0 ₽"
    sign = "+" if cents > 0 else "-"
    return f"{sign}{format_kopecks(abs(cents))} ₽"


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


async def _check_user_role_async(
    message_or_callback: Message | CallbackQuery,
    *,
    allowed_roles: tuple[UserRole, ...] = (UserRole.owner, UserRole.member),
) -> bool:
    """Phase 12 role-based whitelist check (replaces _is_owner).

    Single SELECT roundtrip (cached at FastAPI dep level not applicable
    here — bot has no request-scope cache; one DB call per command is
    negligible cost per T-12-04-05).
    """
    user = getattr(message_or_callback, "from_user", None)
    if user is None:
        return False
    role = await bot_resolve_user_role(user.id)
    return role in allowed_roles


def _build_disambiguation_kbd(token: str, candidates: list[dict]) -> InlineKeyboardMarkup:
    """Build inline keyboard for category disambiguation (D-48).

    callback_data format: "act:TOKEN:CATEGORY_ID".
    One button per row for readability.
    """
    rows = [
        [
            InlineKeyboardButton(
                text=f"{c['name']} ({c['kind']})",
                callback_data=f"act:{token}:{c['id']}",
            )
        ]
        for c in candidates
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _build_app_kbd() -> InlineKeyboardMarkup:
    """WebApp button keyboard (D-62). Mirrors app/bot/handlers.py::_open_app_keyboard."""
    btn = InlineKeyboardButton(
        text="Открыть бюджет",
        web_app=WebAppInfo(url=settings.MINI_APP_URL),
    )
    return InlineKeyboardMarkup(inline_keyboard=[[btn]])


def _format_created_actual(result: dict, *, kind: str) -> str:
    """Format D-59 reply text for status=created response.

    expense: "✓ Записано: 1 500 ₽ — Категория (desc)\\nОстаток по категории: X ₽"
    income: "✓ Доход: 50 000 ₽ — Категория (desc)"
    """
    actual = result["actual"]
    cat = result["category"]
    balance_cents = result.get("category_balance_cents")
    desc = actual.get("description")
    head_kind = "Записано" if kind == "expense" else "Доход"
    head = f"✓ {head_kind}: {format_kopecks(actual['amount_cents'])} ₽ — {cat['name']}"
    if desc:
        head += f" ({desc})"
    if balance_cents is not None:
        if kind == "expense":
            tail = f"\nОстаток по категории: {format_kopecks(balance_cents)} ₽"
        else:
            tail = f"\nДоходы периода (Δ): {format_kopecks_with_sign(balance_cents)}"
        return head + tail
    return head


def _balance_emoji(actual: int, planned: int, kind: str) -> str:
    """Return D-60 emoji for a category row.

    expense: actual/planned ≥80% and ≤100% → ⚠️; >100% → 🔴; <80% → ✓.
    income: ≥100% → ✓; 80-100% → ⚠️; <80% → 🔴 (inverse logic).
    No planned budget (0) → ✓ neutral.
    """
    if planned == 0:
        return "✓"
    pct = actual / planned * 100
    if kind == "expense":
        if pct > 100:
            return "🔴"
        if pct >= 80:
            return "⚠️"
        return "✓"
    else:
        if pct >= 100:
            return "✓"
        if pct >= 80:
            return "⚠️"
        return "🔴"


def _format_balance_reply(result: dict) -> str:
    """Format D-60 /balance reply text from BotBalanceResponse JSON."""
    # Period dates come as ISO strings from Pydantic v2 JSON serialisation.
    def _parse_date_str(s: object) -> str:
        if isinstance(s, str):
            return datetime.fromisoformat(s).strftime("%d %b").lower()
        return str(s)

    period_start = _parse_date_str(result["period_start"])
    period_end = _parse_date_str(result["period_end"])

    by_cat = sorted(
        result["by_category"], key=lambda r: abs(r["delta_cents"]), reverse=True
    )[:5]

    lines = [
        f"💰 Баланс: {format_kopecks_with_sign(result['balance_now_cents'])}",
        f"Δ периода: {format_kopecks_with_sign(result['delta_total_cents'])}",
        "",
        "Топ-5 категорий:",
    ]
    for r in by_cat:
        emoji = _balance_emoji(r["actual_cents"], r["planned_cents"], r["kind"])
        if r["planned_cents"] > 0:
            pct = round(r["actual_cents"] / r["planned_cents"] * 100)
            extra = f", {pct}%" if pct >= 80 else ""
        else:
            extra = ""
        lines.append(
            f"{emoji} {r['name']}: {format_kopecks(r['actual_cents'])} / "
            f"{format_kopecks(r['planned_cents'])} ₽ "
            f"(Δ {format_kopecks_with_sign(r['delta_cents'])}{extra})"
        )
    lines.append("")
    lines.append(f"Период: {period_start} — {period_end}")
    return "\n".join(lines)


def _format_today_reply(result: dict) -> str:
    """Format D-61 /today reply text from BotTodayResponse JSON."""
    actuals = result.get("actuals", [])
    if not actuals:
        return "Сегодня нет факт-трат."
    today_str = datetime.now(ZoneInfo(settings.APP_TZ)).strftime("%d %B %Y")
    lines = [f"Сегодня ({today_str}):"]
    for a in actuals:
        line = f"• {a['category_name']}: {format_kopecks(a['amount_cents'])} ₽"
        if a.get("description"):
            line += f" — {a['description']}"
        lines.append(line)
    if result.get("total_expense_cents", 0) > 0:
        lines.append(
            f"Итого расходов: {format_kopecks(result['total_expense_cents'])} ₽"
        )
    if result.get("total_income_cents", 0) > 0:
        lines.append(
            f"Итого доходов: {format_kopecks(result['total_income_cents'])} ₽"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Shared logic for /add and /income
# ---------------------------------------------------------------------------


async def _handle_add_or_income(
    message: Message, command: CommandObject, *, kind: str
) -> None:
    """Common implementation for /add (kind=expense) and /income (kind=income)."""
    user = message.from_user
    if not user:
        return  # silent — service message
    if not await _check_user_role_async(message):
        return  # silent — non-whitelisted (T-04-30)

    parsed = parse_add_command(command.args)
    if parsed is None:
        cmd_name = "add" if kind == "expense" else "income"
        await message.answer(
            f"Использование: /{cmd_name} <сумма> <категория> [описание]\n"
            f"Например: /{cmd_name} 1500 продукты пятёрочка"
        )
        return

    amount_cents, category_query, description = parsed

    try:
        result = await bot_create_actual(
            tg_user_id=user.id,
            kind=kind,
            amount_cents=amount_cents,
            category_query=category_query,
            description=description,
        )
    except InternalApiError as exc:
        logger.warning("bot.cmd.api_failed", cmd=kind, error=str(exc))
        await message.answer("Не удалось связаться с сервером. Попробуйте позже.")
        return

    status = result.get("status")
    if status == "created":
        await message.answer(_format_created_actual(result, kind=kind))
    elif status == "ambiguous":
        candidates = result.get("candidates", [])
        token = store_pending(
            PendingActual(
                chat_id=message.chat.id,
                kind=kind,
                amount_cents=amount_cents,
                description=description,
                tx_date=None,
                candidates=candidates,
            )
        )
        kbd = _build_disambiguation_kbd(token, candidates)
        await message.answer("Уточните категорию:", reply_markup=kbd)
    elif status == "not_found":
        await message.answer(
            "Категория не найдена. Доступные категории: см. список в Mini App."
        )
    else:
        logger.warning("bot.cmd.unknown_status", status=status)
        await message.answer("Неожиданный ответ от сервера.")


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------


@router.message(Command("add"))
async def cmd_add(message: Message, command: CommandObject) -> None:
    """``/add <amount> <category> [desc]`` — записать расход."""
    await _handle_add_or_income(message, command, kind="expense")


@router.message(Command("income"))
async def cmd_income(message: Message, command: CommandObject) -> None:
    """``/income <amount> <category> [desc]`` — записать доход."""
    await _handle_add_or_income(message, command, kind="income")


@router.message(Command("balance"))
async def cmd_balance(message: Message) -> None:
    """``/balance`` — сводка баланса текущего периода (D-60)."""
    user = message.from_user
    if not user or not await _check_user_role_async(message):
        return
    try:
        result = await bot_get_balance(user.id)
    except InternalApiError as exc:
        logger.warning("bot.cmd.balance.api_failed", error=str(exc))
        await message.answer(
            "Не удалось получить баланс. Возможно, нужно завершить onboarding в Mini App."
        )
        return
    await message.answer(_format_balance_reply(result))


@router.message(Command("today"))
async def cmd_today(message: Message) -> None:
    """``/today`` — список факт-трат за сегодня (D-61)."""
    user = message.from_user
    if not user or not await _check_user_role_async(message):
        return
    try:
        result = await bot_get_today(user.id)
    except InternalApiError as exc:
        logger.warning("bot.cmd.today.api_failed", error=str(exc))
        await message.answer("Не удалось получить список трат за сегодня.")
        return
    await message.answer(_format_today_reply(result))


@router.message(Command("app"))
async def cmd_app(message: Message) -> None:
    """``/app`` — кнопка запуска Mini App (D-62)."""
    if not await _check_user_role_async(message):
        return
    await message.answer(
        "Откройте Mini App для управления бюджетом:",
        reply_markup=_build_app_kbd(),
    )


# ---------------------------------------------------------------------------
# Callback handler
# ---------------------------------------------------------------------------


@router.callback_query(F.data.startswith("act:"))
async def cb_disambiguation(callback: CallbackQuery) -> None:
    """Handle inline-keyboard tap: resolve category and create actual (D-47, D-48).

    callback_data format: ``act:TOKEN:CATEGORY_ID``.
    Pops pending state, re-calls internal API with explicit category_id.
    """
    if not await _check_user_role_async(callback):
        await callback.answer()  # silent dismiss (T-04-37)
        return

    parts = (callback.data or "").split(":", 2)
    if len(parts) != 3 or parts[0] != "act":
        await callback.answer("Некорректный формат.", show_alert=False)
        return
    _, token, category_id_str = parts
    try:
        category_id = int(category_id_str)
    except ValueError:
        await callback.answer("Некорректный id категории.", show_alert=False)
        return

    pending = pop_pending(token)
    if pending is None:
        await callback.answer("Время ожидания истекло.", show_alert=True)
        if callback.message:
            try:
                await callback.message.edit_reply_markup(reply_markup=None)
            except Exception:
                pass  # message may be too old for edit
        return

    try:
        result = await bot_create_actual(
            tg_user_id=callback.from_user.id,
            kind=pending.kind,
            amount_cents=pending.amount_cents,
            category_id=category_id,
            description=pending.description,
            tx_date=pending.tx_date,
        )
    except InternalApiError as exc:
        logger.warning("bot.cb.api_failed", error=str(exc))
        await callback.answer("Сервер недоступен.", show_alert=True)
        return

    status = result.get("status")
    if status == "created":
        text = _format_created_actual(result, kind=pending.kind)
        if callback.message:
            try:
                await callback.message.edit_text(text)
            except Exception:
                # edit_text may fail (e.g., message too old, parse mode mismatch)
                await callback.message.answer(text)
    else:
        await callback.answer(f"Неожиданный статус: {status}", show_alert=True)
        return
    await callback.answer()  # always acknowledge on success
