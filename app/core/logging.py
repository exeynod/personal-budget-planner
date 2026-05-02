"""Structlog configuration shared by api/bot/worker entrypoints.

JSON renderer in prod (LOG_FORMAT=json), human-readable ConsoleRenderer in dev
(LOG_FORMAT=console). Per CONTEXT decision D-13.
"""
import logging

import structlog


def configure_logging(log_level: str = "INFO", log_format: str = "json") -> None:
    level = getattr(logging, log_level.upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(message)s")

    if log_format == "json":
        processors = [
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ]
    else:
        processors = [
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="%H:%M:%S"),
            structlog.dev.ConsoleRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
