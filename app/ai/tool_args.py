"""Pydantic argument-models per AI tool (Plan 16-04, AI-02).

Goal: replace silent ``kwargs = {}`` fallback in ``app/api/routes/ai.py`` with
strict validation.  Each model mirrors the relevant OpenAI function-calling
schema entry from ``app/ai/tools.py::TOOLS_SCHEMA``.

Validation contract:
- All fields are Optional except where TOOLS_SCHEMA marks ``required``.
- ``model_dump(exclude_none=True)`` strips Nones so ``tool_fn`` receives only
  what the LLM explicitly passed (preserves existing tool-fn defaults).
- Extra keys are forbidden (``extra='forbid'``) — defends against LLM
  hallucinating fields like deprecated ``category_hint``.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class _BaseToolArgs(BaseModel):
    """Common config: forbid extra keys."""

    model_config = ConfigDict(extra="forbid")


class GetPeriodBalanceArgs(_BaseToolArgs):
    """Tool: ``get_period_balance`` — no args."""


class GetCategorySummaryArgs(_BaseToolArgs):
    category_id: Optional[int] = Field(default=None, ge=1)


class QueryTransactionsArgs(_BaseToolArgs):
    limit: Optional[int] = Field(default=10, ge=1, le=50)
    kind: Optional[Literal["expense", "income"]] = None
    category_id: Optional[int] = Field(default=None, ge=1)


class GetForecastArgs(_BaseToolArgs):
    """Tool: ``get_forecast`` — no args."""


class ProposeActualArgs(_BaseToolArgs):
    amount_rub: float  # required (no default)
    kind: Optional[Literal["expense", "income"]] = "expense"
    description: Optional[str] = ""
    tx_date: Optional[str] = None


class ProposePlannedArgs(_BaseToolArgs):
    amount_rub: float  # required
    kind: Optional[Literal["expense", "income"]] = "expense"
    description: Optional[str] = ""
    day_of_period: Optional[int] = Field(default=None, ge=1, le=31)


# Mapping tool_name -> args model. Used in ``app/api/routes/ai.py`` dispatcher.
TOOL_ARGS_MODELS: dict[str, type[_BaseToolArgs]] = {
    "get_period_balance": GetPeriodBalanceArgs,
    "get_category_summary": GetCategorySummaryArgs,
    "query_transactions": QueryTransactionsArgs,
    "get_forecast": GetForecastArgs,
    "propose_actual_transaction": ProposeActualArgs,
    "propose_planned_transaction": ProposePlannedArgs,
}


def humanize_tool_args_error(tool_name: str, exc: Exception) -> str:
    """Convert ``ValidationError`` / ``JSONDecodeError`` to a user-facing message.

    Message goes to SSE ``tool_error`` event → ChatMessage. Must NOT contain
    raw exception text (SEC-02 principle); just say which tool + that args
    were invalid. Detailed errors stay in ``logger.warning`` only.
    """
    return (
        f"AI попытался вызвать инструмент с некорректными параметрами "
        f"({tool_name}). Переформулируй запрос."
    )
