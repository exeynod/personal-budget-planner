# Phase 3: Plan Template & Planned Transactions — Research

**Researched:** 2026-05-02
**Domain:** SQLAlchemy 2 async bulk insert, React inline-edit (carry-over), CSS-only bottom-sheet для Telegram Mini App, idempotent endpoints без unique constraints.
**Confidence:** HIGH (большинство паттернов уже проверены в Phase 1+2; новые элементы — bulk insert и bottom-sheet — стандартные).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-30:** Никаких schema migrations в Phase 3.
- **D-31:** Idempotency apply-template — через `SELECT count() WHERE source='template'`, не через unique constraint.
- **D-32:** snapshot-from-period — destructive overwrite; включает `template + manual`, исключает `subscription_auto`.
- **D-33:** Два router'а: `templates_router`, `planned_router`.
- **D-34:** Pydantic схемы в `app/api/schemas/templates.py` и `planned.py`.
- **D-35:** Service-слой: `app/services/templates.py`, `app/services/planned.py`.
- **D-36:** Domain validation: archived category → 400; kind mismatch → 400; amount > 0; day_of_period 1..31.
- **D-37:** PLN-03 «🔁 Подписка» badge для `source='subscription_auto'`; mock-injection verification в Phase 3.
- **D-38..D-39:** Apply-template UI conditional на пустой период; snapshot UI с window.confirm.
- **D-40:** BottomSheet — CSS-only, переиспользуется в Phase 4.
- **D-41..D-42:** TemplateScreen/PlannedScreen layout.
- **D-43:** Reuse Phase 2 patterns (apiFetch, useCategories, SectionCard, CategoryRow inline-edit).
- **D-44:** Wave 0 RED tests; нет frontend unit-тестов.

### Claude's Discretion

- Точные имена React-компонентов (`PlanRow`, `PlanItemEditor`).
- Структура BottomSheet — universal vs specialized.
- Имена exception-классов.
- Текст empty-state и toast-сообщений.

### Deferred Ideas (OUT OF SCOPE)

- Drag-n-drop reorder, per-row copy, bulk-edit, CSV import — отложено.
- Worker close_period вызов apply-template — Phase 5.
- Bot plan editing — out of scope MVP.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TPL-01 | Один PlanTemplate, items: category, amount, description, day_of_period | Модель `PlanTemplateItem` готова в Phase 1 |
| TPL-02 | CRUD строк шаблона UI (group-by-category + inline edit + bottom-sheet) | Паттерн sketch 005-B + reuse Phase 2 CategoryRow inline-edit |
| TPL-03 | «Перенести план в шаблон» — snapshot | POST /template/snapshot-from-period/{id}, DELETE+INSERT atomic |
| TPL-04 | apply-template idempotent | D-31: source-based check, без unique constraint |
| PLN-01 | CRUD plan-строк периода | Стандартный REST + PATCH для inline-edit |
| PLN-02 | source enum (template/manual/subscription_auto) | enum уже в `PlanSource`; service выставляет `source=manual` для POST, `source=template` для apply, `source=subscription_auto` для Phase 6 worker |
| PLN-03 | «🔁 from subscription» badge | Frontend conditional rendering на `source==='subscription_auto'`; verification через mock-injection (D-37) |

**Note on PER-05:** В Phase 2 был помечен deferred. В Phase 3 закрывается endpoint'ом `POST /periods/{id}/apply-template` (TPL-04). Phase 5 worker `close_period` будет звать этот endpoint при создании нового периода — структурно покрыто здесь.

</phase_requirements>

---

## Summary

Phase 3 — это «продолжение» доменной работы из Phase 2: те же паттерны (service-layer + thin routes + Pydantic schemas + group-by-kind UI + inline-edit), но для двух новых сущностей. Главные новшества:

1. **Idempotent apply-template** — реализуется чисто на уровне сервиса (count + skip), без миграций или unique constraint. Это ключевое архитектурное решение фазы (D-31).
2. **Snapshot semantics** — destructive overwrite, исключающий subscription_auto (D-32). Это нужно понять до имплементации, чтобы не записать «не ту» логику.
3. **BottomSheet компонент** — первый универсальный модал в проекте; CSS-only, без deps. Будет переиспользован в Phase 4 для add-actual.
4. **PLN-03 в условиях отсутствия данных** — UI готовится к Phase 6 на mock'ах. Это снимает блокер «нельзя верифицировать без подписок» — мы верифицируем структурно (код-ветка существует и рендерит правильно на инжектированной mock-строке).

Большая часть кода backend — стандартные FastAPI CRUD-эндпоинты с Pydantic-валидацией. Frontend копирует структуру `CategoriesScreen` (group-by-kind) с добавлением BottomSheet для полного редактора.

**Primary recommendation:** Использовать `db.add_all([...])` + `db.flush()` для bulk insert в apply-template — стандартный SQLAlchemy 2 паттерн. Не использовать `bulk_insert_mappings` (не возвращает auto-generated id; не нужно для нашего use-case, т.к. apply-template возвращает id'шники для UI).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Template item CRUD | `app/services/templates.py` | `app/api/routes/templates.py` | Service: list/create/update/delete/snapshot-from-period; route — тонкий слой |
| Snapshot from period | `app/services/templates.py::snapshot_from_period` | `app/api/routes/templates.py` | Atomic DELETE + INSERT в одной транзакции; route мапит exceptions |
| Planned CRUD (manual) | `app/services/planned.py` | `app/api/routes/planned.py` | Service: list_for_period, create_manual, update, delete; route — REST контракт |
| Apply template (idempotent) | `app/services/planned.py::apply_template_to_period` | `app/api/routes/planned.py` | D-31: source-based check; результат — planned rows, поэтому live в `planned.py` |
| Domain validation (archived cat, kind mismatch) | `app/services/planned.py` + `templates.py` | — | Поднимается `InvalidCategoryError`, route → 400 |
| subscription_auto read-only enforcement | `app/services/planned.py::update_planned/delete_planned` | — | D-37: server-side guard (`SubscriptionPlannedReadOnlyError` → 400) |
| TemplateScreen UI | `frontend/src/screens/TemplateScreen.tsx` | `PlanRow.tsx`, `BottomSheet.tsx`, `PlanItemEditor.tsx` | Group-by-kind layout (Phase 2 паттерн), inline-edit + BottomSheet полного редактора |
| PlannedScreen UI | `frontend/src/screens/PlannedScreen.tsx` | `PlanRow.tsx`, `BottomSheet.tsx`, `PlanItemEditor.tsx` | Те же компоненты, разные actions (apply-template, snapshot) и read-only логика для subscription_auto |
| BottomSheet primitive | `frontend/src/components/BottomSheet.tsx` | — | CSS-only modal, переиспользуется в Phase 4 (add-actual) |
| PlanItemEditor (form) | `frontend/src/components/PlanItemEditor.tsx` | category select, amount input, description, day_of_period/planned_date | Универсальный редактор для template-item и planned-row (discriminated по mode) |
| API clients | `frontend/src/api/templates.ts`, `planned.ts` | `apiFetch` (Phase 2) | Тонкие обёртки |
| Hooks | `frontend/src/hooks/useTemplate.ts`, `usePlanned.ts`, `useCurrentPeriod.ts` | `apiFetch` | Pattern Phase 2 useCategories: state + refetch |
| App routing | `frontend/src/App.tsx` (modify) | useState | Добавить `'template'`, `'planned'` в Screen union, две nav-кнопки в HomeScreen |

---

## Standard Stack

### New Backend Dependencies

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none) | — | — | Все нужное уже в pyproject.toml: SQLAlchemy 2.0.49, Pydantic 2.13.3, FastAPI 0.128.8 |

### New Frontend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| (none) | — | BottomSheet — CSS-only; useCategories уже есть |

### Carryover from Phase 2

Все Phase 2 зависимости (python-dateutil, httpx, @telegram-apps/sdk-react) — без изменений.

---

## Architecture Patterns

### Pattern 1: SQLAlchemy 2 async bulk insert через `db.add_all()`

**What:** Вставить N строк в одной транзакции, получить auto-generated id'шники.
**When to use:** В `apply_template_to_period` — конвертим N template items в N planned rows.

```python
# app/services/planned.py
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    PlannedTransaction, PlanTemplateItem, PlanSource, BudgetPeriod, Category,
)


async def apply_template_to_period(
    db: AsyncSession, *, period_id: int,
) -> dict:
    """D-31: idempotent — skip if any source='template' row exists for period."""
    # 1. Validate period exists
    period = await db.get(BudgetPeriod, period_id)
    if period is None:
        raise PeriodNotFoundError(period_id)

    # 2. Idempotency check
    existing_count = await db.scalar(
        select(func.count())
        .select_from(PlannedTransaction)
        .where(
            PlannedTransaction.period_id == period_id,
            PlannedTransaction.source == PlanSource.template,
        )
    )
    if existing_count and existing_count > 0:
        # Return existing rows; create=0 signals "no-op"
        result = await db.execute(
            select(PlannedTransaction).where(
                PlannedTransaction.period_id == period_id,
                PlannedTransaction.source == PlanSource.template,
            )
        )
        return {
            "period_id": period_id,
            "created": 0,
            "planned": list(result.scalars().all()),
        }

    # 3. Load template items + their categories (for kind)
    items_result = await db.execute(
        select(PlanTemplateItem).options(selectinload(PlanTemplateItem.category))
    )
    items = list(items_result.scalars().all())

    # 4. Build new PlannedTransaction rows
    new_rows = [
        PlannedTransaction(
            period_id=period_id,
            kind=item.category.kind,  # mirror category kind
            amount_cents=item.amount_cents,
            description=item.description,
            category_id=item.category_id,
            planned_date=_clamp_planned_date(period, item.day_of_period),
            source=PlanSource.template,
            subscription_id=None,
        )
        for item in items
    ]

    if not new_rows:
        # Empty template — return [] but still 200 OK
        return {"period_id": period_id, "created": 0, "planned": []}

    db.add_all(new_rows)
    await db.flush()  # populate auto-generated ids

    # Refresh to get full state (id + defaults)
    for row in new_rows:
        await db.refresh(row)

    return {"period_id": period_id, "created": len(new_rows), "planned": new_rows}


def _clamp_planned_date(period: BudgetPeriod, day_of_period: int | None) -> date | None:
    """Map template day_of_period to actual date inside period bounds.

    `day_of_period` is 1..31 (template-relative day number from period start).
    If it would fall outside period_end, clamp to period_end.
    Returns None if day_of_period is None.
    """
    if day_of_period is None:
        return None
    candidate = period.period_start + timedelta(days=day_of_period - 1)
    if candidate > period.period_end:
        return period.period_end
    return candidate
```

[VERIFIED: SQLAlchemy 2.x docs — `add_all` + `flush` + `refresh` pattern; same as `seed_default_categories` in Phase 2]

### Pattern 2: Atomic DELETE + INSERT для snapshot

**What:** Полностью перезаписать таблицу `plan_template_item` строками из текущего периода.
**When to use:** В `snapshot_from_period` — TPL-03.

```python
# app/services/templates.py
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PlanTemplateItem, PlannedTransaction, PlanSource, BudgetPeriod


async def snapshot_from_period(
    db: AsyncSession, *, period_id: int,
) -> dict:
    """D-32: destructive overwrite of PlanTemplate from current planned rows.

    Includes source IN ('template', 'manual'); excludes 'subscription_auto'.
    Single transaction (DELETE + INSERT atomic via session boundary).
    """
    # Validate period exists
    period = await db.get(BudgetPeriod, period_id)
    if period is None:
        raise PeriodNotFoundError(period_id)

    # 1. Count existing for response metadata
    prev_count = await db.scalar(
        select(func.count()).select_from(PlanTemplateItem)
    )

    # 2. SELECT planned rows to copy
    result = await db.execute(
        select(PlannedTransaction)
        .where(
            PlannedTransaction.period_id == period_id,
            PlannedTransaction.source.in_([PlanSource.template, PlanSource.manual]),
        )
        .order_by(
            PlannedTransaction.category_id,
            PlannedTransaction.planned_date.nulls_last(),
            PlannedTransaction.id,
        )
    )
    rows = list(result.scalars().all())

    # 3. DELETE all existing template items
    await db.execute(delete(PlanTemplateItem))

    # 4. INSERT new template items
    new_items = [
        PlanTemplateItem(
            category_id=row.category_id,
            amount_cents=row.amount_cents,
            description=row.description,
            day_of_period=row.planned_date.day if row.planned_date else None,
            sort_order=idx * 10,  # leave gaps for future manual reorder
        )
        for idx, row in enumerate(rows)
    ]
    db.add_all(new_items)
    await db.flush()
    for it in new_items:
        await db.refresh(it)

    return {
        "template_items": new_items,
        "replaced": prev_count or 0,
    }
```

[VERIFIED: SQLAlchemy 2.x — `delete()` + `add_all()` в одном session — атомарно через get_db boundary]

### Pattern 3: React inline-edit с Enter/Esc (carryover)

Используем `frontend/src/components/CategoryRow.tsx` как референс. Для PlanRow:
- Tap на amount → input (autofocus, blur=cancel, Enter=save, Esc=cancel).
- Tap на description/badge → open BottomSheet.
- Saving state: disabled input + spinner indicator.

### Pattern 4: CSS-only Bottom Sheet (sketch 002-B style)

**What:** Слайд-вверх модал с backdrop, без библиотек.
**When to use:** Полный редактор plan-item / template-item.

```tsx
// frontend/src/components/BottomSheet.tsx
import { useEffect, type ReactNode } from 'react';
import styles from './BottomSheet.module.css';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  // Esc closes (browser dev fallback; Telegram BackButton wired separately)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Wire Telegram BackButton if available
    const tgBackBtn = window.Telegram?.WebApp?.BackButton;
    if (tgBackBtn) {
      tgBackBtn.show();
      tgBackBtn.onClick(onClose);
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      if (tgBackBtn) {
        tgBackBtn.offClick(onClose);
        tgBackBtn.hide();
      }
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`${styles.sheet} ${open ? styles.sheetOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.handle} />
        <div className={styles.head}>
          <h3 className={styles.title}>{title}</h3>
          <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>
  );
}
```

```css
/* BottomSheet.module.css (key rules) */
.backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  opacity: 0; pointer-events: none;
  transition: opacity 250ms ease-out;
  z-index: 100;
}
.backdropOpen { opacity: 1; pointer-events: auto; }

.sheet {
  position: fixed; bottom: 0; left: 0; right: 0;
  max-height: 85vh; overflow: auto;
  background: var(--color-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  transform: translateY(100%);
  transition: transform 250ms ease-out;
  z-index: 101;
  padding-bottom: var(--safe-bottom);
}
.sheetOpen { transform: translateY(0); }

.handle {
  width: 40px; height: 4px; background: var(--color-border);
  border-radius: var(--radius-full); margin: 12px auto 0;
}
```

**Note on Telegram BackButton:** `window.Telegram.WebApp.BackButton` управляет нативной кнопкой назад в Telegram header. При открытии sheet — show + onClick(onClose); при закрытии — hide. В browser dev отсутствует — Esc как fallback.

[VERIFIED: Telegram WebApp BackButton API — telegram.org/docs/web-apps/api]

### Pattern 5: PlanItemEditor (универсальная форма для full edit)

**What:** Единый компонент-форма внутри BottomSheet, поддерживает create/edit для template-item и planned-row.
**When to use:** Открывается из PlanRow tap или «+ Добавить строку».

```tsx
// frontend/src/components/PlanItemEditor.tsx (skeleton)
import { useState } from 'react';
import type { CategoryRead } from '../api/types';

export interface PlanItemEditorProps {
  mode: 'create-template' | 'edit-template' | 'create-planned' | 'edit-planned';
  initial?: { category_id?: number; amount_cents?: number; description?: string | null; day_of_period?: number | null; planned_date?: string | null };
  categories: CategoryRead[]; // pre-fetched, not archived
  onSave: (data: { category_id: number; amount_cents: number; description: string | null; day_or_date: number | string | null }) => Promise<void>;
  onCancel: () => void;
}

export function PlanItemEditor(props: PlanItemEditorProps) {
  // ... category select, amount (rubles), description, day_of_period (template) | planned_date (planned)
  // Submit -> props.onSave(...)
}
```

Key behaviors:
- Category: `<select>` с группировкой kind (Расходы / Доходы), фильтр archived=false.
- Amount: input type="text" inputmode="decimal", парсит рубли в копейки (как в OnboardingScreen).
- Description: textarea, max 500 chars.
- For template mode: numeric input «День периода (опц.)» 1..31.
- For planned mode: `<input type="date">` для `planned_date` с min/max=period bounds.
- Save button — disabled пока обязательные не заполнены.

### Anti-Patterns to Avoid

- **Не использовать unique constraint** на `(period_id, source, category_id)` для idempotency — D-31 объясняет.
- **Не делать `bulk_insert_mappings` без id'шников** — нам нужны id'шники в response.
- **Не открывать BottomSheet через Portal** — лишняя сложность; `position: fixed` + z-index достаточно.
- **Не реализовывать swipe-to-dismiss** — лишняя логика; tap-on-backdrop + Esc + Telegram BackButton покрывают close.
- **Не создавать отдельный bottom-sheet компонент для template и для planned** — одна обёртка `BottomSheet` + один `PlanItemEditor` (с mode prop).
- **Не делать ручной `select * from plan_template_item join category` через raw SQL** — используем `selectinload(PlanTemplateItem.category)`.
- **Не доверять frontend amount в копейках без серверной валидации** — Pydantic `Field(gt=0)` обязателен.
- **Не позволять создание plan-строк с архивной категорией** — D-36 server-side guard.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bulk insert N rows | `INSERT INTO ... SELECT ...` raw SQL | `db.add_all([...])` + `flush` | Получаем id'шники, ORM-friendly |
| Idempotency через DB constraints | Unique on много колонок | Service-level count + skip | D-31, не требует миграции |
| Bottom sheet animation | JS animation engine (framer-motion) | CSS `transition: transform` | Меньше bundle |
| Modal lifecycle | React Portal | `position: fixed` + Telegram BackButton | Достаточно для Mini App |
| Category select dropdown | Custom autocomplete | `<select>` с `<optgroup>` | Native, accessible |
| Date picker | react-datepicker | `<input type="date">` | Native iOS/Android picker |
| Amount input rubles↔kopecks | money.js | Простой `Math.round(parseFloat(...) * 100)` | Одна функция; уже в OnboardingScreen |

---

## Common Pitfalls

### Pitfall 1: SQLAlchemy lazy-loading на async session при apply-template

**What goes wrong:** `item.category.kind` на async session без eager-load → MissingGreenlet error (sync access в async context).
**How to avoid:** `selectinload(PlanTemplateItem.category)` в SELECT.

### Pitfall 2: planned_date выходит за границы периода

**What goes wrong:** Пользователь задал `day_of_period=31` в шаблоне, период длится 28 дней — `planned_date = period_start + 30 days` уходит в следующий период.
**How to avoid:** Clamp к `period_end` (см. `_clamp_planned_date` в Pattern 1).

### Pitfall 3: Snapshot включает subscription_auto и шаблон засоряется

**What goes wrong:** Subscription rows автоматически создаются worker'ом каждый период; если snapshot включит их, шаблон будет дублировать подписки → при apply будет два списания.
**How to avoid:** D-32: фильтр `source IN ('template', 'manual')` в SELECT, явно исключаем subscription_auto.

### Pitfall 4: BottomSheet остаётся открытым после navigate

**What goes wrong:** User открыл sheet, нажал Telegram BackButton — Telegram «свернул» Mini App, при возврате sheet всё ещё в open state, но BackButton handler уже не подписан.
**How to avoid:** В `useEffect` cleanup: всегда `onClose()` при unmount + `tg.BackButton.hide()`. Также: при открытии нового screen всегда сбрасывать local state (sheet open → false).

### Pitfall 5: Inline-edit amount, blur при прокрутке списка

**What goes wrong:** Touchscreen scroll триггерит blur на input → cancel вместо save (если blur=cancel).
**How to avoid:** Используем onKeyDown Enter для save, **explicit save-button** (галочка ✓ как в CategoryRow). Blur можно сделать save-on-blur (если значение валидно), либо ничего не делать (только Enter / Esc / button).
**Решение для Phase 3:** копируем CategoryRow паттерн — есть кнопки ✓ / × рядом с input, blur не делает ничего автоматически.

### Pitfall 6: Frontend amount input принимает «0» или «-100»

**What goes wrong:** Пользователь сохраняет план-строку с amount=0 → bessmysslennaya zапись.
**How to avoid:** Frontend валидация (`canSubmit = amount_cents > 0`) + server-side Pydantic `Field(gt=0)` (D-36).

### Pitfall 7: Apply-template ломается, если шаблон пуст

**What goes wrong:** `db.add_all([])` — no-op, но `created: 0` — это «уже применён», UX путает.
**How to avoid:** Возвращаем `{created: 0, planned: []}` явно с другим signal-полем `was_empty: true` (опц.) ИЛИ ничего особенного — UI покажет toast «Шаблон пуст» если `created == 0 && planned.length == 0`. (Решение: второй вариант — простее.)

### Pitfall 8: kind plan-строки расходится с kind категории

**What goes wrong:** Пользователь создаёт plan-row с kind='income', а category.kind='expense' → UX-несогласованность.
**How to avoid:** D-36 server-side validation. Frontend: при выборе категории — auto-set kind = category.kind, поле `kind` в форме скрыто (derived).

---

## Code Examples (additional)

### Pydantic schemas (template + planned)

```python
# app/api/schemas/templates.py
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


class TemplateItemCreate(BaseModel):
    category_id: int = Field(gt=0)
    amount_cents: int = Field(gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    day_of_period: Optional[int] = Field(default=None, ge=1, le=31)
    sort_order: int = Field(default=0, ge=0)


class TemplateItemUpdate(BaseModel):
    category_id: Optional[int] = Field(default=None, gt=0)
    amount_cents: Optional[int] = Field(default=None, gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    day_of_period: Optional[int] = Field(default=None, ge=1, le=31)
    sort_order: Optional[int] = Field(default=None, ge=0)


class TemplateItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_id: int
    amount_cents: int
    description: Optional[str]
    day_of_period: Optional[int]
    sort_order: int


class SnapshotFromPeriodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    template_items: list[TemplateItemRead]
    replaced: int


# app/api/schemas/planned.py
from datetime import date
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field

PlanSourceStr = Literal["template", "manual", "subscription_auto"]
KindStr = Literal["expense", "income"]


class PlannedCreate(BaseModel):
    """POST /periods/{id}/planned — manual creation only."""
    kind: KindStr
    amount_cents: int = Field(gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: int = Field(gt=0)
    planned_date: Optional[date] = None


class PlannedUpdate(BaseModel):
    kind: Optional[KindStr] = None
    amount_cents: Optional[int] = Field(default=None, gt=0)
    description: Optional[str] = Field(default=None, max_length=500)
    category_id: Optional[int] = Field(default=None, gt=0)
    planned_date: Optional[date] = None


class PlannedRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    period_id: int
    kind: KindStr
    amount_cents: int
    description: Optional[str]
    category_id: int
    planned_date: Optional[date]
    source: PlanSourceStr
    subscription_id: Optional[int]


class ApplyTemplateResponse(BaseModel):
    period_id: int
    created: int
    planned: list[PlannedRead]
```

---

## Open Questions

1. **Стоит ли возвращать `category` (nested) в TemplateItemRead/PlannedRead для удобства frontend?**
   - Что знаем: Frontend всё равно делает `useCategories()` для category select; имея `category_id`, может lookup'ить локально. Nested категория добавит сложности (selectinload в каждом запросе).
   - Решение: НЕ возвращаем nested. Frontend lookups by id из useCategories result. Если в Phase 5 понадобится — добавим.

2. **Как обрабатывать редактирование template после применения?**
   - Что знаем: Шаблон → apply → planned rows. Если user редактирует template после apply, planned rows уже скопированы, изменения не отражаются. Это by design — apply-template одноразовая операция в каждом периоде.
   - Решение: Никакой синхронизации не делаем. Документируем в UI: «Изменения шаблона применятся к следующему периоду». UI-tooltip или подзаголовок на TemplateScreen.

3. **PER-05 — что именно мы покрываем в Phase 3?**
   - Phase 3 покрывает только endpoint `apply-template`. Сам триггер при создании нового периода — Phase 5 worker.
   - В Phase 3 пользователь нажимает «Применить шаблон» вручную через UI — это покрывает PER-05 структурно.

4. **Должен ли apply-template быть строго `POST` или мы могли бы сделать `PUT` (для семантики идемпотентности)?**
   - HTTP стандарт: POST допускает идемпотентность, если endpoint так заявляет. PUT тоже подходит, но HLD §4.4 указывает POST. Не отступаем от HLD.
   - Решение: POST, как в HLD.

5. **Можно ли в одном HTTP вызове создать N planned-строк (bulk POST)?**
   - Что знаем: HLD не предусматривает bulk POST. UI создаёт строки по одной через BottomSheet.
   - Решение: Только single POST. Bulk-create — out of scope (deferred ideas).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| (none new) | — | ✓ | — | — |
| Postgres | DB-backed tests | docker compose up -d db | 16-alpine | self-skip pattern |

---

## Validation Architecture

### Test Framework (carryover from Phase 1+2)

| Property | Value |
|----------|-------|
| Framework | pytest 8.4.2 + pytest-asyncio 1.2.0 |
| Quick run | `uv run pytest tests/test_templates.py tests/test_planned.py -x -q` |
| Full suite | `uv run pytest tests/ -v` |
| DB-backed integration tests | требуют `DATABASE_URL` (как в Phase 2); self-skip без него |
| Frontend tests | None automated (D-44; carryover D-22 Phase 2) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| TPL-01 | Структура PlanTemplateItem (category, amount, description, day_of_period) | integration | `uv run pytest tests/test_templates.py::test_create -x` |
| TPL-02 | CRUD template + UI (group-by-kind + inline edit) | integration + manual | `uv run pytest tests/test_templates.py -x` + checkpoint:human-verify |
| TPL-03 | Snapshot from period | integration | `uv run pytest tests/test_snapshot.py -x` |
| TPL-04 | Apply-template idempotent | integration | `uv run pytest tests/test_apply_template.py::test_idempotent -x` |
| PLN-01 | CRUD planned + filter | integration | `uv run pytest tests/test_planned.py -x` |
| PLN-02 | source enum выставляется правильно | integration | `uv run pytest tests/test_planned.py::test_manual_source -x` + `tests/test_apply_template.py::test_template_source -x` |
| PLN-03 | Visual marker «🔁 from subscription» | manual | checkpoint:human-verify с mock-injection |

### Sampling Rate

- **Per task commit:** `uv run pytest tests/test_templates.py tests/test_planned.py -x -q` (~5s)
- **Per wave merge:** `uv run pytest tests/ -v` (~30-60s)
- **Phase gate:** Полный suite зелёный + manual checkpoint pass

### Wave 0 Gaps

- [ ] `tests/test_templates.py` — CRUD template-items + snapshot-from-period
- [ ] `tests/test_planned.py` — CRUD planned + filter + subscription_auto read-only
- [ ] `tests/test_apply_template.py` — apply + idempotency
- [ ] `tests/test_snapshot.py` — destructive overwrite + exclude subscription_auto

(frontend без unit-тестов в Phase 3 — D-44; UI verification — manual checkpoint)

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (наследуется из Phase 1+2).

### Applicable ASVS Categories (Phase 3 deltas)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (carry-over) | initData HMAC + OWNER whitelist |
| V4 Access Control | yes | Все `/api/v1/*` под `Depends(get_current_user)`; нет internal endpoints в Phase 3 |
| V5 Input Validation | yes | Pydantic v2 на все bodies; `Field(gt=0)` для amount; `Field(ge=1, le=31)` для day_of_period; archived category check (server-side); kind-mismatch check |
| V8 Data Protection | n/a | Никакой PII в плане — только суммы и описания. Стандартная защита БД (Phase 1) применяется |

### Known Threat Patterns for Phase 3

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Apply-template создаёт дубли при гонке двух запросов | Tampering | D-31 source-check + DB transaction (одна транзакция per request); maximum один дубль (если две transactions запустились одновременно). Для single-tenant приемлемо; в Phase 5 worker сериализует через advisory lock. |
| User создаёт plan-строку с category_id несуществующей категории | Tampering | FK constraint в БД → IntegrityError → service ловит + 400 |
| User создаёт plan-строку с archived category | Tampering | D-36 service-side check + 400 InvalidCategoryError |
| Snapshot включает subscription_auto, ломая шаблон | Information Disclosure / Tampering | D-32 SELECT WHERE source IN ('template', 'manual') |
| Edit subscription_auto plan-row из UI обходит worker | Tampering | D-37 server-side guard `SubscriptionPlannedReadOnlyError` |
| Negative amount или amount=0 | Input Validation | Pydantic `Field(gt=0)` |
| description с XSS-payload | XSS | React escape по умолчанию; не используем `dangerouslySetInnerHTML` |
| Frontend amount overflow (Number.MAX_SAFE_INTEGER) | Input Validation | Pydantic int — Python big int OK; на frontend `Math.round(parseFloat(...) * 100)` для разумных сумм. Edge: 9 × 10^15 копеек = 9×10^13 рублей — больше любой реалистичной суммы. |
| `day_of_period > 28` создаёт планы за пределами короткого месяца | Input Validation | Pydantic 1..31 + `_clamp_planned_date` clamp к period_end |

---

## Project Constraints (from CLAUDE.md — Phase 3 deltas)

| Directive | Impact на Phase 3 |
|-----------|------------------|
| Деньги BIGINT копейки | `amount_cents: int`, валидируется `Field(gt=0)` |
| Бизнес-даты DATE | `planned_date: Optional[date]`, `day_of_period: Optional[int]` |
| Soft delete только category | Template-items и planned-rows — hard delete (`DELETE` действительно удаляет) |
| Single-tenant без user_id FK | Все таблицы уже без user_id (Phase 1) |
| Знак дельты — не релевантен в Phase 3 | (применяется в Phase 5 dashboard) |
| Period расчёт `Europe/Moscow` | Текущий период читается через `get_current_active_period` (Phase 2) — TZ уже учтён |
| initData HMAC | Все routes под `Depends(get_current_user)` |
| Internal endpoints | Нет в Phase 3 |
| structlog | info на apply-template (created=N), info на snapshot (replaced=N), warning на отказ редактирования subscription_auto |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `selectinload(PlanTemplateItem.category)` работает в async session как в sync | Pattern 1 | Низкий — это стандартный SA 2 паттерн, проверен в других проектах |
| A2 | `db.add_all([...])` сохраняет порядок при `flush` | Pattern 2 | Не критично — sort_order вычисляем явно `idx * 10` |
| A3 | Telegram WebApp `BackButton` доступен в Mini App из `window.Telegram.WebApp` | Pattern 4 | Если нет — Esc-fallback работает в browser dev; в Telegram swipe-down закроет sheet (Telegram default) |
| A4 | Frontend `<input type="date">` корректно работает в Telegram Mini App webview | Pitfall 5 | Если не работает в каком-то клиенте — fallback на text input + manual parse; проверить в checkpoint:human-verify |
| A5 | Subscription Phase 6 worker НЕ нарушит invariant «source=subscription_auto не редактируется через API» | D-37 | Phase 6 worker должен использовать DB-уровень или внутренний service skip-check; учесть при планировании Phase 6 |
| A6 | `category.kind` (PgEnum) корректно сравнивается с `PlanSource.template` (PgEnum) в SQL — с PgEnum (`create_type=False` reuse) — не перепутаются типы в WHERE | Pattern 1, 2 | Phase 1 использует `categorykind` enum уже расшаренный; новых enum'ов в Phase 3 не вводим |

---

## Sources

### Primary (HIGH confidence)

- `docs/HLD.md` — единый источник истины для API/DB/source enum
- `docs/BRD.md` UC-4, UC-5 — план месяца, шаблон
- `.planning/sketches/005-plan-and-categories/` — winner B (grouped + inline edit)
- `.planning/sketches/002-add-transaction/` — winner B (bottom sheet) — паттерн для BottomSheet
- SQLAlchemy 2.0.49 docs — async session, `add_all`, `selectinload`
- Pydantic 2.13.3 docs — Field validators

### Secondary (MEDIUM confidence)

- Telegram WebApp API docs — `BackButton`, `MainButton` (v6.0+)
- React 18 inline-edit pattern — Phase 2 working code

### Tertiary

- CSS bottom-sheet articles — confirmed working pattern w/o library

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — никаких новых зависимостей
- Architecture: HIGH — прямо задана HLD + CONTEXT
- Bulk insert pattern: HIGH — стандартный SA 2
- Snapshot semantics: HIGH — D-32 явно фиксирует включение/исключение source
- Idempotency without unique constraint: MEDIUM — D-31 принят, но нужно покрыть параметризованный тест на race-condition (см. Threat Pattern «Apply-template дубли при гонке»)
- BottomSheet UX: MEDIUM — CSS-only паттерн стандартный, но Telegram BackButton lifecycle стоит проверить в checkpoint
- PLN-03 visual: MEDIUM — UI-готовность можно верифицировать, end-to-end ждёт Phase 6

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (стек стабильный, 30 дней)
