"""SQLAlchemy 2.x ORM models for TG Budget Planner.

Conventions (CLAUDE.md):
- Money: BIGINT kopecks (*_cents fields), no Float
- Dates: DATE for business dates, TIMESTAMPTZ for audit timestamps (UTC in DB)
- Soft delete: only Category (is_archived). Transactions/subscriptions: hard delete.
- Single-tenant MVP: NO user_id FK on any table.

Tables (HLD §2):
- app_user, category, budget_period, plan_template_item,
- planned_transaction, actual_transaction, subscription
- app_health (worker heartbeat per D-12)
"""
import enum
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TIMESTAMP

from app.db.base import Base


# ---------- Enums (HLD §2.2) ----------


class CategoryKind(str, enum.Enum):
    expense = "expense"
    income = "income"


class PeriodStatus(str, enum.Enum):
    active = "active"
    closed = "closed"


class PlanSource(str, enum.Enum):
    template = "template"
    manual = "manual"
    subscription_auto = "subscription_auto"


class ActualSource(str, enum.Enum):
    mini_app = "mini_app"
    bot = "bot"


class SubCycle(str, enum.Enum):
    monthly = "monthly"
    yearly = "yearly"


# ---------- Models ----------


class AppUser(Base):
    __tablename__ = "app_user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tg_user_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    tg_chat_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    cycle_start_day: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    notify_days_before: Mapped[int] = mapped_column(
        Integer, default=2, nullable=False, server_default="2"
    )
    onboarded_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class Category(Base):
    __tablename__ = "category"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[CategoryKind] = mapped_column(
        PgEnum(CategoryKind, name="categorykind", create_type=False), nullable=False
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class BudgetPeriod(Base):
    __tablename__ = "budget_period"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    starting_balance_cents: Mapped[int] = mapped_column(
        BigInteger, default=0, nullable=False
    )
    ending_balance_cents: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    status: Mapped[PeriodStatus] = mapped_column(
        PgEnum(PeriodStatus, name="periodstatus", create_type=False),
        default=PeriodStatus.active,
        nullable=False,
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    planned_transactions: Mapped[list["PlannedTransaction"]] = relationship(
        back_populates="period"
    )
    actual_transactions: Mapped[list["ActualTransaction"]] = relationship(
        back_populates="period"
    )


class PlanTemplateItem(Base):
    __tablename__ = "plan_template_item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)
    amount_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    day_of_period: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    category: Mapped["Category"] = relationship()


class Subscription(Base):
    __tablename__ = "subscription"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    amount_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    cycle: Mapped[SubCycle] = mapped_column(
        PgEnum(SubCycle, name="subcycle", create_type=False), nullable=False
    )
    next_charge_date: Mapped[date] = mapped_column(Date, nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)
    notify_days_before: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    category: Mapped["Category"] = relationship()

    __table_args__ = (
        Index("ix_subscription_active_charge", "is_active", "next_charge_date"),
    )


class PlannedTransaction(Base):
    __tablename__ = "planned_transaction"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("budget_period.id"), nullable=False)
    kind: Mapped[CategoryKind] = mapped_column(
        PgEnum(CategoryKind, name="categorykind", create_type=False), nullable=False
    )
    amount_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)
    planned_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    source: Mapped[PlanSource] = mapped_column(
        PgEnum(PlanSource, name="plansource", create_type=False), nullable=False
    )
    subscription_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("subscription.id"), nullable=True
    )
    original_charge_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    period: Mapped["BudgetPeriod"] = relationship(back_populates="planned_transactions")
    category: Mapped["Category"] = relationship()

    __table_args__ = (
        Index("ix_planned_period_kind", "period_id", "kind"),
        UniqueConstraint(
            "subscription_id",
            "original_charge_date",
            name="uq_planned_sub_charge_date",
        ),
    )


class ActualTransaction(Base):
    __tablename__ = "actual_transaction"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("budget_period.id"), nullable=False)
    kind: Mapped[CategoryKind] = mapped_column(
        PgEnum(CategoryKind, name="categorykind", create_type=False), nullable=False
    )
    amount_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)
    tx_date: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[ActualSource] = mapped_column(
        PgEnum(ActualSource, name="actualsource", create_type=False), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    period: Mapped["BudgetPeriod"] = relationship(back_populates="actual_transactions")
    category: Mapped["Category"] = relationship()

    __table_args__ = (
        Index("ix_actual_period_kind", "period_id", "kind"),
        Index("ix_actual_category_date", "category_id", "tx_date"),
    )


class AppHealth(Base):
    """Worker heartbeat table (D-12)."""

    __tablename__ = "app_health"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    service: Mapped[str] = mapped_column(String(50), nullable=False)
    last_heartbeat_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )


# ---- Phase 9: AI Assistant ----


class AiConversation(Base):
    """Одна глобальная conversation на пользователя (single-tenant, AI-06)."""

    __tablename__ = "ai_conversation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    messages: Mapped[list["AiMessage"]] = relationship(
        back_populates="conversation", order_by="AiMessage.id"
    )


class AiMessage(Base):
    """Одно сообщение в AI-разговоре. role: 'user'|'assistant'|'tool' (AI-06)."""

    __tablename__ = "ai_message"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("ai_conversation.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tool_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tool_result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    conversation: Mapped["AiConversation"] = relationship(back_populates="messages")

    __table_args__ = (Index("ix_ai_message_conversation", "conversation_id"),)
