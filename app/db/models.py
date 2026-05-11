"""SQLAlchemy 2.x ORM models for TG Budget Planner.

Conventions (CLAUDE.md):
- Money: BIGINT kopecks (*_cents fields), no Float
- Dates: DATE for business dates, TIMESTAMPTZ for audit timestamps (UTC in DB)
- Soft delete: only Category (is_archived). Transactions/subscriptions: hard delete.
- Multi-tenant since Phase 11: user_id BIGINT NOT NULL FK → app_user.id ON DELETE RESTRICT
  присутствует на всех доменных таблицах. RLS policies (см. alembic 0006/0012/0015).

Tables (HLD §2 + Phase 22 v1.0):
- app_user, category, account, budget_period,
- planned_transaction, actual_transaction, subscription, goal, savings_config
- app_health (worker heartbeat per D-12)
- category_embedding (Phase 10: AI Categorization — pgvector)

Phase 22 (v1.0 maximal poster):
- ``plan_template_item`` dropped (CONTEXT D-02) — Category.plan_cents now SoT.
- Category extended (plan_cents, code, ord, rollover, paused, parent_id).
- ActualTransaction.kind → 4-valued ``actualkind`` enum (expense/income/roundup/deposit)
  + parent_txn_id self-FK for roundup children.
- New tables: account, goal, savings_config.
- Subscription extended (day_of_month, account_id, posted_txn_id).
- BudgetPeriod extended (misc_rollover_cents, rollover_processed_at).
"""
import enum
from datetime import date, datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import TIMESTAMP

from app.db.base import Base


# ---------- Enums (HLD §2.2 + Phase 22) ----------


class CategoryKind(str, enum.Enum):
    """Category-level kind. 2-valued (expense/income).

    Phase 22 (BE-06): мигрирована на новый PG type ``category_kind``
    (миграция 0014). ActualTransaction теперь использует отдельный
    ``ActualKind`` (4-valued) — старый PG type ``categorykind`` был
    переименован в ``actualkind`` и расширен до 4 значений.
    """

    expense = "expense"
    income = "income"


class ActualKind(str, enum.Enum):
    """Phase 22 (BE-06): 4-valued kind для actual_transaction.

    expense / income — прямые действия пользователя.
    roundup — авто-генерируемый child от expense при SavingsConfig.roundup_enabled.
    deposit — ручное пополнение копилки или rollover-deposit на закрытии периода.

    PlannedTransaction.kind ссылается на тот же PG enum (``actualkind``),
    но семантически принимает только {expense, income}. Pydantic-схемы в
    plan 22.12 валидируют это явно (T-22-05-02).
    """

    expense = "expense"
    income = "income"
    roundup = "roundup"
    deposit = "deposit"


class AccountKind(str, enum.Enum):
    """Phase 22 (BE-02): account.kind PG enum ``account_kind``."""

    card = "card"
    cash = "cash"
    savings = "savings"


class RolloverPolicy(str, enum.Enum):
    """Phase 22 (BE-04): category.rollover policy.

    misc — period-end остаток виртуально аккумулируется в
        ``budget_period.misc_rollover_cents`` (без отдельной txn).
    savings — period-end остаток создаёт ``ActualTransaction(kind=deposit)``
        в системную категорию «КОПИЛКА».

    Хранится как VARCHAR(8) с CHECK constraint на DB (см. 0013), не PG enum —
    позволяет легче добавлять новые политики без ALTER TYPE.
    """

    misc = "misc"
    savings = "savings"


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
    # Scale 100/USD per spend_cap.py (1 USD == 100 storage units).
    # Default = 500 cents = $5/month per user (Phase 32 REQ-32-03,
    # alembic 0018 migration). Bumped from 100 ($1) per PRODUCT-STRATEGY
    # v1.1 monetization foundation — $5/mo даёт comfortable headroom
    # для conversational AI usage в paying tier.
    spending_cap_cents: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=500,
        server_default="500",
    )
    # Phase 22 (BE-01): месячный доход после налогов (копейки).
    # NULL = "не вводил доход" — UI редиректит на onboarding-edit
    # (alembic 0012). Backfill для existing rows = NULL.
    income_cents: Mapped[Optional[int]] = mapped_column(
        BigInteger, nullable=True
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
    """Доменная категория (расход/доход) пользователя.

    Phase 22 (BE-04): расширена 6 новыми колонками. `kind` теперь ссылается
    на новый 2-valued PG enum ``category_kind`` (migration 0014 разделила
    старый ``categorykind`` 2-value → ``category_kind`` 2-value (для категорий)
    + ``actualkind`` 4-value (для actual_transaction)).

    Composite FK ``(parent_id, user_id) → (id, user_id)`` (CONTEXT D-01,
    BE-16) объявлен на DB-level в migration 0013 — SQLAlchemy ORM не умеет
    декларировать composite FK на non-PK target чисто, поэтому ``parent_id``
    мапится без ``ForeignKey()`` чтобы не дублировать constraint. Cross-tenant
    защита на DB-уровне.
    """

    __tablename__ = "category"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[CategoryKind] = mapped_column(
        PgEnum(CategoryKind, name="category_kind", create_type=False), nullable=False
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

    # ---- Phase 22 (BE-04) extensions ----
    # plan_cents — лимит на текущий месяц (BE-04, replaces PlanTemplateItem).
    plan_cents: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    # code — slug для системных категорий ('food', 'cafe', 'savings', ...)
    # и кастомных категорий пользователя (transliterate(name)). UNIQUE per
    # user среди active rows (partial index uq_category_user_code, 0013).
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    # ord — '01'..'99' display ordinal. CHAR(2) на DB, на ORM мапим через
    # String(2). CHECK constraint на формат — на DB.
    ord: Mapped[str] = mapped_column(String(2), nullable=False)
    # rollover — куда уходит остаток на закрытии периода ('misc' | 'savings').
    # Хранится VARCHAR(8) — DB CHECK enforces enum (см. 0013).
    rollover: Mapped[RolloverPolicy] = mapped_column(
        String(8),
        nullable=False,
        default=RolloverPolicy.misc,
        server_default="misc",
    )
    # paused — true = категория не учитывается в расчётах текущего периода
    # (отличается от is_archived — paused остаётся в queries).
    paused: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # parent_id — composite FK (parent_id, user_id) → (id, user_id) объявлен
    # на DB level (migration 0013, constraint ``fk_category_parent_composite``).
    # ORM держит как plain BigInteger без ForeignKey() — composite self-FK
    # на non-PK target нельзя декларировать чисто. ON DELETE SET NULL.
    parent_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    # Self-referencing relationship (R3 future subcategories).
    # Использует foreign_keys+remote_side для self-FK без declared FK constraint
    # (composite FK живёт на DB-level).
    parent: Mapped[Optional["Category"]] = relationship(
        "Category",
        remote_side="Category.id",
        foreign_keys="Category.parent_id",
        primaryjoin="Category.parent_id == Category.id",
        back_populates="children",
    )
    children: Mapped[list["Category"]] = relationship(
        "Category",
        foreign_keys="Category.parent_id",
        primaryjoin="Category.parent_id == Category.id",
        back_populates="parent",
    )

    __table_args__ = (
        Index(
            "uq_category_user_id_name",
            "user_id",
            "name",
            unique=True,
            postgresql_where=text("NOT is_archived"),
        ),
        # Phase 22 (BE-04): partial unique index на (user_id, code) WHERE NOT is_archived.
        Index(
            "uq_category_user_code",
            "user_id",
            "code",
            unique=True,
            postgresql_where=text("NOT is_archived"),
        ),
        # Phase 22 (BE-16): composite UNIQUE для composite FK target.
        UniqueConstraint("id", "user_id", name="ux_category_id_user"),
        # CHECK constraints (DB-level, дублируем в ORM metadata для autogen
        # alignment — alembic owns DDL, create_type/create_constraint=False
        # неявно через factual existence в migration 0013).
        CheckConstraint(
            "rollover IN ('misc', 'savings')",
            name="ck_category_rollover_enum",
        ),
        CheckConstraint(
            "ord ~ '^[0-9]{2}$'",
            name="ck_category_ord_format",
        ),
    )


class Account(Base):
    """Phase 22 (BE-02): пользовательские счета (карты/наличные/копилки).

    Multi-tenant via user_id FK ON DELETE RESTRICT (нельзя удалить юзера с
    активными счетами; данные критичны для аудита). RLS-policy
    ``tenant_isolation_account`` на DB-level (alembic 0012).

    NOTE on ``primary``: имя колонки в БД — ``primary``, что является зарезервированным
    словом в Python. ORM-атрибут переименован в ``is_primary``, маппится на
    DB-колонку ``"primary"`` (T-22-05-03 mitigation). Partial unique index
    ``ix_account_user_primary_one`` гарантирует ≤1 primary на пользователя.

    Trust delta-accounting (CONTEXT §Area 2): ``balance_cents`` обновляется
    атомарно с insert/delete txn в service-layer. Reconciliation cron не
    вводим — single source of truth = txn-таблица + balance как cache.
    """

    __tablename__ = "account"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=False,
    )
    bank: Mapped[str] = mapped_column(String(40), nullable=False)
    mask: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    kind: Mapped[AccountKind] = mapped_column(
        PgEnum(AccountKind, name="account_kind", create_type=False),
        nullable=False,
    )
    balance_cents: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    # Python-attr ``is_primary`` → DB column ``"primary"`` (reserved word).
    is_primary: Mapped[bool] = mapped_column(
        "primary",
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_account_user_id", "user_id"),
        # T-22-01-02 mitigation: ровно один primary на пользователя.
        Index(
            "ix_account_user_primary_one",
            "user_id",
            unique=True,
            postgresql_where=text('"primary" = true'),
        ),
        # T-22-01-03 mitigation: bank length и balance overflow.
        CheckConstraint(
            "char_length(bank) BETWEEN 1 AND 40",
            name="ck_account_bank_length",
        ),
        CheckConstraint(
            "balance_cents >= -100000000000 AND balance_cents <= 100000000000",
            name="ck_account_balance_range",
        ),
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

    # ---- Phase 22 (BE-14) rollover idempotency ----
    # misc_rollover_cents — суммарный остаток "misc"-категорий, переносимый
    # в next period (DATA-MODEL §3 «Прочее»). NOT NULL DEFAULT 0.
    misc_rollover_cents: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    # rollover_processed_at — timestamp успешного завершения close_period_job.
    # NULL = ещё не процессили; NOT NULL = уже сделано (idempotency check).
    rollover_processed_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
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
        # Phase 22 (BE-14, T-22-03-06): defensive partial unique index против
        # double-write race в close_period_job. id уже PK сам по себе, но
        # partial UNIQUE WHERE rollover_processed_at IS NOT NULL служит
        # discriminator'ом на DB-уровне для idempotent rollover.
        Index(
            "uq_period_rolled",
            "id",
            unique=True,
            postgresql_where=text("rollover_processed_at IS NOT NULL"),
        ),
    )


# NOTE: ``PlanTemplateItem`` was dropped in Phase 22 (CONTEXT D-02, alembic 0013).
# ``Category.plan_cents`` is now the source of truth for per-category monthly limit.
# Historical plan-snapshot analytics, if needed, can be reconstructed from
# ``PlannedTransaction`` rows. Service-layer references to PlanTemplateItem
# (``app/services/templates.py``, ``app/services/planned.py:get_template``,
# routes ``app/api/routes/templates.py``) will be removed/refactored in
# subsequent Phase-22 plans (22.06+ and 22.13).


class Subscription(Base):
    """Регулярный платёж (подписка/аренда/...).

    Phase 22 (BE-12): расширена тремя колонками для интеграции с Account
    и actual_transaction (post/unpost флоу).
    """

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

    # ---- Phase 22 (BE-12) extensions ----
    # day_of_month — день месяца (1..28, clamp на февраль). NULL = legacy/no-day,
    # fallback на next_charge_date. CHECK constraint на DB (см. 0014).
    day_of_month: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    # account_id — со счёта какого spend происходит. RESTRICT — нельзя удалить
    # account, если есть подписки.
    account_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("account.id", ondelete="RESTRICT"),
        nullable=True,
    )
    # posted_txn_id — если регулярка проведена в текущем месяце, ссылка на
    # actual_transaction. ON DELETE SET NULL — при удалении txn регулярка
    # становится "не проведённой" в этом месяце.
    posted_txn_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("actual_transaction.id", ondelete="SET NULL"),
        nullable=True,
    )

    category: Mapped["Category"] = relationship()
    account: Mapped[Optional["Account"]] = relationship(
        "Account", foreign_keys="Subscription.account_id"
    )
    posted_txn: Mapped[Optional["ActualTransaction"]] = relationship(
        "ActualTransaction", foreign_keys="Subscription.posted_txn_id"
    )

    __table_args__ = (
        Index("ix_subscription_active_charge", "is_active", "next_charge_date"),
        UniqueConstraint("user_id", "name", name="uq_subscription_user_id_name"),
        # Phase 22 (BE-12): partial index для PLAN-list query (DATA-MODEL §1.5).
        Index(
            "ix_subscription_user_day",
            "user_id",
            "day_of_month",
            postgresql_where=text("day_of_month IS NOT NULL"),
        ),
        # CHECK constraint (T-22-03-04): day_of_month ∈ [1, 28] inclusive.
        CheckConstraint(
            "day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 28)",
            name="ck_subscription_day_of_month",
        ),
    )


class PlannedTransaction(Base):
    """Запланированная транзакция (текущий период).

    Phase 22 (BE-06 note): ``kind`` колонка ссылается на новый PG type
    ``actualkind`` (renamed from ``categorykind`` в migration 0014). Семантически
    PlannedTransaction.kind принимает только ``{expense, income}`` — Pydantic
    schemas (plan 22.12) валидируют это явно. ``ActualKind.roundup/deposit``
    permissive на DB-уровне, но service-layer никогда туда такие значения
    не пишет (T-22-05-02).
    """

    __tablename__ = "planned_transaction"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("budget_period.id"), nullable=False)
    kind: Mapped[ActualKind] = mapped_column(
        PgEnum(ActualKind, name="actualkind", create_type=False), nullable=False
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
    """Фактическая транзакция (расход/доход/округление/депозит).

    Phase 22 (BE-06): ``kind`` мигрирована на 4-valued ``ActualKind`` enum
    через PG type ``actualkind`` (renamed-from-``categorykind`` в 0014).
    ``parent_txn_id`` — self-FK для roundup-children: при создании expense
    с включенным roundup создаётся child txn ``kind=roundup``, чьё
    ``parent_txn_id`` указывает на родителя. ON DELETE CASCADE — удаление
    parent expense удаляет связанный roundup. Composite FK
    ``(parent_txn_id, user_id) → (id, user_id)`` объявлен на DB-level
    в migration 0015 (cross-tenant защита, BE-16). ORM использует simple
    self-FK без composite — DB-level FK достаточен (T-22-05-04).
    """

    __tablename__ = "actual_transaction"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("budget_period.id"), nullable=False)
    kind: Mapped[ActualKind] = mapped_column(
        PgEnum(ActualKind, name="actualkind", create_type=False), nullable=False
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

    # ---- Phase 22 (BE-06) self-FK для roundup-children ----
    # Simple self-FK на DB level дополнен composite FK
    # (parent_txn_id, user_id) → (id, user_id) в migration 0015 для
    # cross-tenant защиты. SQLAlchemy ORM использует simple ref —
    # DB-level composite FK достаточен (T-22-05-04 accept).
    parent_txn_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("actual_transaction.id", ondelete="CASCADE"),
        nullable=True,
    )

    # ---- Phase 22 (BE-07 fix-up, migration 0016) ----
    # account_id — счёт, на котором отражена транзакция. NULL-able для
    # legacy v0.x rows (где счетов ещё не было). ON DELETE RESTRICT —
    # нельзя удалить account, если на нём есть факт-транзакции.
    # Service-layer (accounts.delete_account) raises AccountHasTxnsError(409)
    # до того, как DB-constraint срабатывает.
    account_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("account.id", ondelete="RESTRICT"),
        nullable=True,
    )

    period: Mapped["BudgetPeriod"] = relationship(back_populates="actual_transactions")
    category: Mapped["Category"] = relationship()
    # Self-relationships: parent_txn → roundup children (1:N).
    parent_txn: Mapped[Optional["ActualTransaction"]] = relationship(
        "ActualTransaction",
        remote_side="ActualTransaction.id",
        foreign_keys="ActualTransaction.parent_txn_id",
        back_populates="children",
    )
    children: Mapped[list["ActualTransaction"]] = relationship(
        "ActualTransaction",
        foreign_keys="ActualTransaction.parent_txn_id",
        back_populates="parent_txn",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_actual_period_kind", "period_id", "kind"),
        Index("ix_actual_category_date", "category_id", "tx_date"),
        # Phase 22 (BE-06): partial index для cascade-deletion lookups +
        # roundup-children queries (только child-rows).
        Index(
            "ix_actual_parent_txn_id",
            "parent_txn_id",
            postgresql_where=text("parent_txn_id IS NOT NULL"),
        ),
        # Phase 22 (BE-07 fix-up, migration 0016): account_id index для
        # балансных пересчётов и delete-protection lookups.
        Index("ix_actual_account_id", "account_id"),
        # Phase 22 (BE-16): composite UNIQUE для composite FK target
        # (parent_txn_id, user_id) → (id, user_id), создан в migration 0015.
        UniqueConstraint("id", "user_id", name="ux_actual_id_user"),
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


# ---- Phase 17 (v0.6): native client auth tokens (IOSAUTH-02) ----


class AuthToken(Base):
    """Long-lived Bearer token для нативных клиентов (iOS).

    Phase 17 (v0.6 IOSAUTH-02): web-фронт продолжает шлать TG initData
    через X-Telegram-Init-Data; iOS-клиент получает токен через
    POST /api/v1/auth/dev-exchange (на dev) или TG Login Widget /
    Sign in with Apple (на prod в Phase 21) и шлёт его как
    Authorization: Bearer <token>. Расширение get_current_user
    (Plan 17-03) пробует Bearer первым, fallback на initData.

    Хранится только sha256(token) — plaintext-токен виден один раз
    в response /auth/dev-exchange, дальше его невозможно прочитать
    из БД.

    revoked_at = NULL → токен активен. Revocation flow отложен (Phase 18+).
    last_used_at обновляется на каждой успешной auth — даёт грубый
    audit-stream и helps detect stale tokens.

    ON DELETE CASCADE: при удалении user (revoke flow Phase 13)
    auto-purge всех его токенов.
    """

    __tablename__ = "auth_token"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_auth_token_user", "user_id"),
    )


# ---- Phase 22 (v1.0): Goals & Savings ----


class Goal(Base):
    """Цель копилки (BE-11, DATA-MODEL §1.6).

    Multi-tenant via user_id FK ON DELETE RESTRICT (нельзя удалить юзера
    с активными целями — требуется явный revoke flow). RLS-policy
    ``tenant_isolation_goal`` на DB-level (alembic 0014/0015).

    Validators (DATA-MODEL §6, проверяются на Pydantic + DB CHECK):
      - target_cents > 0
      - char_length(name) ∈ [1, 80]
    """

    __tablename__ = "goal"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    target_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    current_cents: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    due: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_goal_user_id", "user_id"),
        CheckConstraint("target_cents > 0", name="ck_goal_target_positive"),
        CheckConstraint(
            "char_length(name) BETWEEN 1 AND 80",
            name="ck_goal_name_length",
        ),
    )


class SavingsConfig(Base):
    """Per-user roundup configuration (BE-08, DATA-MODEL §1.7).

    PK = user_id (1:1 — одна конфигурация на пользователя). ON DELETE CASCADE:
    при revoke юзера config purge'ится автоматически (T-22-03-07 — savings_config
    не критичная audit-data, можно дропать).

    roundup_base ∈ {10, 50, 100} (₽) — DB CHECK enforces (T-22-03-05).
    Roundup formula (DATA-MODEL §4): delta = ceil(|amount| / base) * base − |amount|.
    """

    __tablename__ = "savings_config"

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("app_user.id", ondelete="CASCADE"),
        primary_key=True,
    )
    roundup_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # SmallInteger в БД — соответствует INT2 в migration 0014.
    roundup_base: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=10, server_default="10"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "roundup_base IN (10, 50, 100)",
            name="ck_savings_config_base_enum",
        ),
    )
