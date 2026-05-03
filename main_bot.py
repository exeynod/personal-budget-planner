"""aiogram bot entry point for the bot container.

Phase 2 scope (ONB-03):
- ``/start`` handler: OWNER-only, calls
  ``POST /api/v1/internal/telegram/chat-bind`` to persist ``tg_chat_id``,
  replies with an InlineKeyboardButton(web_app=WebAppInfo(MINI_APP_URL)).
  Implementation lives in :mod:`app.bot.handlers` (factored out for
  testability and to keep ``main_bot.py`` minimal).
- ``GET /healthz`` on port 8001 (INF-05, D-12) via aiohttp running
  concurrently with ``dp.start_polling`` in the same event loop.

Phase 4 scope (ACT-03/04/05):
- ``/add``, ``/income``, ``/balance``, ``/today``, ``/app`` + disambiguation callback.
  Implementation in :mod:`app.bot.commands`.

Mode: long-poll (D-04).
"""
import asyncio

import structlog
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiohttp import web

from app.bot.commands import router as commands_router  # Phase 4 handlers
from app.bot.handlers import router as start_router  # Phase 2 handler — replaces stub
from app.core.logging import configure_logging
from app.core.settings import settings


configure_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
logger = structlog.get_logger(__name__)


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
    dp.include_router(start_router)
    dp.include_router(commands_router)

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
