"""Categories CRUD + soft-archive + seed (CAT-01, CAT-02, CAT-03).

Service layer is HTTP-framework-agnostic: raises domain exceptions
(``CategoryNotFoundError``) which the route layer (Plan 02-04) maps to
HTTPException(404). No FastAPI imports here per Phase 2 success criterion
"Service layer is pure: no FastAPI imports".
"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.categories import CategoryUpdate
from app.db.models import Category, CategoryKind


# CAT-03: 14 default categories proposed during onboarding (D-16).
# Schema: (name, kind_str, sort_order)
SEED_CATEGORIES: list[tuple[str, str, int]] = [
    # expense (12)
    ("Продукты", "expense", 10),
    ("Дом", "expense", 20),
    ("Машина", "expense", 30),
    ("Кафе и рестораны", "expense", 40),
    ("Здоровье", "expense", 50),
    ("Подарки", "expense", 60),
    ("Развлечения", "expense", 70),
    ("Одежда", "expense", 80),
    ("Транспорт", "expense", 90),
    ("Подписки", "expense", 100),
    ("Связь и интернет", "expense", 110),
    ("Прочее", "expense", 120),
    # income (2)
    ("Зарплата", "income", 10),
    ("Прочие доходы", "income", 20),
]


class CategoryNotFoundError(Exception):
    """Raised when a category lookup by id returns no row.

    Route layer (Plan 02-04) maps this to ``HTTPException(404)``. Keeping the
    service layer free of FastAPI imports makes the same code reusable from
    worker jobs / CLI / tests without dragging in HTTP semantics.
    """

    def __init__(self, category_id: int) -> None:
        self.category_id = category_id
        super().__init__(f"Category {category_id} not found")


async def list_categories(
    db: AsyncSession, *, include_archived: bool = False
) -> list[Category]:
    """Return categories ordered by (kind ASC: expense first, sort_order ASC, name ASC).

    CAT-02: by default skips archived (is_archived=true).
    """
    stmt = select(Category)
    if not include_archived:
        stmt = stmt.where(Category.is_archived.is_(False))
    stmt = stmt.order_by(Category.kind, Category.sort_order, Category.name)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_category(
    db: AsyncSession,
    *,
    name: str,
    kind: str,
    sort_order: int = 0,
) -> Category:
    """Create a new category. `kind` must be a CategoryKind value ('expense' or 'income')."""
    cat = Category(
        name=name,
        kind=CategoryKind(kind),
        sort_order=sort_order,
        is_archived=False,
    )
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


async def get_or_404(db: AsyncSession, category_id: int) -> Category:
    """Fetch a category or raise ``CategoryNotFoundError``.

    Name kept as ``get_or_404`` to match the export contract in 02-03-PLAN
    interfaces; the actual exception is the domain error, mapped to HTTP 404
    by the route layer.
    """
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalar_one_or_none()
    if cat is None:
        raise CategoryNotFoundError(category_id)
    return cat


async def update_category(
    db: AsyncSession,
    category_id: int,
    patch: CategoryUpdate,
) -> Category:
    """Apply non-None fields from `patch`. Allows un-archive via is_archived=False."""
    cat = await get_or_404(db, category_id)
    data = patch.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(cat, field, value)
    await db.flush()
    await db.refresh(cat)
    return cat


async def archive_category(db: AsyncSession, category_id: int) -> Category:
    """CAT-02: soft-archive — set is_archived=True. DELETE handler delegates here."""
    cat = await get_or_404(db, category_id)
    cat.is_archived = True
    await db.flush()
    await db.refresh(cat)
    return cat


async def seed_default_categories(db: AsyncSession) -> list[Category]:
    """CAT-03: insert SEED_CATEGORIES. Idempotent — skip if any category exists.

    Returns the list of newly created categories (empty list if skipped).
    """
    existing_count = await db.scalar(select(func.count()).select_from(Category))
    if existing_count and existing_count > 0:
        return []  # idempotent: skip seed entirely

    rows = [
        Category(
            name=name,
            kind=CategoryKind(kind),
            sort_order=sort_order,
            is_archived=False,
        )
        for name, kind, sort_order in SEED_CATEGORIES
    ]
    db.add_all(rows)
    await db.flush()
    for cat in rows:
        await db.refresh(cat)
    return rows
