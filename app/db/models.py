"""SQLAlchemy 2.x ORM models for TG Budget Planner.

Conventions (CLAUDE.md):
- Money: BIGINT kopecks (*_cents fields), no Float
- Dates: DATE for business dates, TIMESTAMPTZ for audit timestamps (UTC in DB)
- Soft delete: only Category (is_archived). Transactions/subscriptions: hard delete.
- Multi-tenant since Phase 11: user_id BIGINT NOT NULL FK → app_user.id ON DELETE RESTRICT
  присутствует на всех 9 доменных таблицах. RLS policies (см. alembic 0006).

Tables (HLD §2):
- app_user, category, budget_period, plan_template_item,
- planned_transaction, actual_transaction, subscription
- app_health (worker heartbeat per D-12)
- category_embedding (Phase 10: AI Categorization — pgvector)
"""
import enum
from datetime import date, datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    Float,
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


class UserRole(str, enum.Enum):
    """Роль пользователя (Phase 11 ROLE-01).

    owner   — единственный администратор; backfill для существующего OWNER_TG_ID.
    member  — приглашённый юзер (default для новых через invite в Phase 13).
    revoked — отозванный доступ; auth-слой блокирует (полная семантика в Phase 12).
    """

    owner = "owner"
    member = "member"
    revoked = "revoked"


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
    enable_ai_categorization: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, server_default="true"
    )
    spending_cap_cents: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=46500,
        server_default="46500",
    )
    role: Mapped[UserRole] = mapped_column(
        PgEnum(UserRole, name="user_role", create_type=False),
        nullable=False,
        server_default="member",
        default=UserRole.member,
    )
    onboarded_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(
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
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_category_user_id_name"),
    )


class BudgetPeriod(Base):
    __tablename__ = "budget_period"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
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
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=False,
    )

    planned_transactions: Mapped[list["PlannedTransaction"]] = relationship(
        back_populates="period"
    )
    actual_transactions: Mapped[list["ActualTransaction"]] = relationship(
        back_populates="period"
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "period_start",
            name="uq_budget_period_user_id_period_start",
        ),
    )


class PlanTemplateItem(Base):
    __tablename__ = "plan_template_item"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"), nullable=False)
    amount_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    day_of_period: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=False,
    )

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
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=False,
    )

    category: Mapped["Category"] = relationship()

    __table_args__ = (
        Index("ix_subscription_active_charge", "is_active", "next_charge_date"),
        UniqueConstraint("user_id", "name", name="uq_subscription_user_id_name"),
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
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=False,
    )

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
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=False,
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
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=False,
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
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=False,
    )

    conversation: Mapped["AiConversation"] = relationship(back_populates="messages")

    __table_args__ = (Index("ix_ai_message_conversation", "conversation_id"),)


# ---- Phase 10: AI Categorization ----


class CategoryEmbedding(Base):
    """Cached embedding для категории (text-embedding-3-small, 1536 dims).

    Используется для cosine similarity suggest в GET /ai/suggest-category.
    category_id — PK и FK на category (CASCADE delete).
    embedding — vector(1536) от pgvector extension.
    """

    __tablename__ = "category_embedding"

    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("category.id", ondelete="CASCADE"), primary_key=True
    )
    embedding: Mapped[list[float]] = mapped_column(Vector(1536), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=False,
    )

    category: Mapped["Category"] = relationship()


# ---- Phase 13: Admin AI Usage Breakdown ----


class AiUsageLog(Base):
    """Persistent log одного /ai/chat вызова (Plan 13-03 hooks here from
    app/api/routes/ai.py::_record_usage). Используется admin /ai-usage
    endpoint (Plan 13-05) для per-user breakdown за current month + 30d.

    ON DELETE CASCADE на user_id — telemetry без защищаемой бизнес-
    семантики, упрощает Phase 13 revoke flow (cascade purge без явного
    DELETE из service-слоя).

    RLS policy (alembic 0008): user_id = current_setting(app.current_user_id).
    Admin endpoint обходит RLS через set_config bypass или privileged
    query (Plan 13-05 detail).
    """

    __tablename__ = "ai_usage_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    model: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    completion_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    cached_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    total_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    est_cost_usd: Mapped[float] = mapped_column(
        Float(asdecimal=False),
        nullable=False,
        default=0.0,
        server_default="0.0",
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_ai_usage_log_user_created", "user_id", "created_at"),
    )
