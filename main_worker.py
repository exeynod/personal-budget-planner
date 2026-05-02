"""APScheduler worker entry point for the worker container.

Phase 1 scope: ``AsyncIOScheduler`` started with a single ``heartbeat`` job
that upserts ``app_health(service='worker', last_heartbeat_at=now)`` every
5 minutes (D-12). This lets external monitoring (Caddy / docker compose
healthcheck / manual ``SELECT * FROM app_health``) detect a stuck worker.

Real cron jobs land in later phases (HLD §6):
- ``notify_subscriptions`` daily at 09:00 Europe/Moscow — Phase 5
- ``charge_subscriptions`` daily at 00:05 Europe/Moscow — Phase 5
- ``close_period`` daily at 00:01 Europe/Moscow — Phase 6

Phase 1 uses MemoryJobStore (no PostgreSQL jobstore yet) per 01-RESEARCH
Pattern 7 + Open Question Q1 — persistence is only required when real
business jobs come online.
"""
import asyncio
from datetime import datetime, timezone

import pytz
import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.core.logging import configure_logging
from app.core.settings import settings
from app.db.models import AppHealth
from app.db.session import AsyncSessionLocal

configure_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
logger = structlog.get_logger(__name__)

MOSCOW_TZ = pytz.timezone(settings.APP_TZ)


async def heartbeat_job() -> None:
    """Upsert worker heartbeat into ``app_health`` (D-12).

    Runs every 5 minutes via APScheduler interval trigger. Uses upsert
    semantics (find-or-create on ``service='worker'``) so the row count
    stays bounded at one per service for the lifetime of the deployment.
    """
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                select(AppHealth).where(AppHealth.service == "worker")
            )
            record = result.scalar_one_or_none()
            now = datetime.now(timezone.utc)
            if record:
                record.last_heartbeat_at = now
            else:
                session.add(
                    AppHealth(service="worker", last_heartbeat_at=now)
                )
            await session.commit()
            logger.info("worker.heartbeat.written")
        except Exception:
            await session.rollback()
            logger.exception("worker.heartbeat.failed")


async def main() -> None:
    scheduler = AsyncIOScheduler(timezone=MOSCOW_TZ)

    # Phase 1: heartbeat every 5 minutes (D-12).
    scheduler.add_job(
        heartbeat_job,
        "interval",
        minutes=5,
        id="heartbeat",
        replace_existing=True,
        next_run_time=datetime.now(MOSCOW_TZ),  # run once immediately on boot
    )

    # Placeholder cron jobs (will be wired in Phase 5/6 against MOSCOW_TZ):
    # scheduler.add_job(notify_subscriptions, "cron", hour=9, minute=0,
    #                   id="notify_subscriptions")
    # scheduler.add_job(charge_subscriptions, "cron", hour=0, minute=5,
    #                   id="charge_subscriptions")
    # scheduler.add_job(close_period, "cron", hour=0, minute=1,
    #                   id="close_period")

    scheduler.start()
    logger.info("worker.scheduler.started", timezone=str(MOSCOW_TZ))

    # Keep the event loop alive. APScheduler runs jobs on the same loop.
    try:
        while True:
            await asyncio.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
        logger.info("worker.scheduler.stopped")


if __name__ == "__main__":
    asyncio.run(main())
