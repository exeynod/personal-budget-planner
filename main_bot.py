"""aiogram bot entry point for the bot container.

Phase 1 scope:
- ``/start`` stub: replies with onboarding placeholder for the owner; reports
  "private bot" for foreign users (defence-in-depth — Telegram already only
  delivers messages from the bot's chats, OWNER_TG_ID is the second gate).
- ``GET /healthz`` on port 8001 (INF-05, D-12) via a lightweight aiohttp
  server running concurrently with ``dp.start_polling`` in the same event
  loop.

Real command handlers (add/income/balance/today/app) and the
``/api/v1/internal/bot/chat-bound`` callback land in Phase 2 (ONB-03) and
Phase 4. Mode: long-poll (D-04) — no callback URL registration needed.
"""
import asyncio

import structlog
from aiogram import Bot, Dispatcher, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import Message
from aiohttp import web

from app.core.logging import configure_logging
from app.core.settings import settings

configure_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
logger = structlog.get_logger(__name__)

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    """``/start``: stub for chat binding; full handler in Phase 2 (ONB-03)."""
    if message.from_user and message.from_user.id == settings.OWNER_TG_ID:
        await message.answer(
            "Бот запущен. Привязка push-уведомлений будет в Phase 2."
        )
    else:
        await message.answer("Бот приватный.")


async def health_handler(request: web.Request) -> web.Response:
    """``GET /healthz`` for the bot container (INF-05, port 8001)."""
    return web.Response(
        text='{"status":"ok","service":"bot"}',
        content_type="application/json",
    )


async def main() -> None:
    bot = Bot(
        token=settings.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()
    dp.include_router(router)

    # Start aiohttp healthz server on port 8001 (D-12, INF-05).
    health_app = web.Application()
    health_app.router.add_get("/healthz", health_handler)
    runner = web.AppRunner(health_app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 8001)
    await site.start()
    logger.info("bot.healthz.started", port=8001)

    # Long-polling (D-04). Blocks until shutdown.
    logger.info("bot.polling.started")
    try:
        await dp.start_polling(bot)
    finally:
        await runner.cleanup()
        await bot.session.close()
        logger.info("bot.shutdown")


if __name__ == "__main__":
    asyncio.run(main())
