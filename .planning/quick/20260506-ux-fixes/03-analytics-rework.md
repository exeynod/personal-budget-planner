# 03 — Аналитика: переосмысление прогноза, unplanned-overspend, daily trend, InfoNote

## Проблемы

1. **«Прогноз на конец периода: −263 060 ₽; Сгорит 350 958 ₽»** — формулировка
   непонятна, формула наивна (`daily_rate × оставшиеся_дни`), игнорирует
   подписки и план.
2. **3M/6M возвращали 500.** `overspend_pct = (Decimal / Decimal) * 100.0`
   падает с `TypeError: Decimal * float`.
3. **«Не удалось загрузить»** на пустом периоде — любой `ApiError` уходил
   в `setError()`.
4. **Тренд расходов на 1M пуст.** Backend агрегировал помесячно, для 1M
   = одна точка, `points.length > 1` = false.
5. **Перерасход не учитывает unplanned-категории.** Если потратил в
   категории, которой не было в плане (Подписки, план=0) — она не попадала
   в Top-overspend (фильтр требовал planned > 0 и наличия в обоих списках).
6. **Метрики неясны** — пользователь не понимает что считается.

## Решения

### Полиморфный `/analytics/forecast?range=...`

```python
async def get_forecast(db, *, range_):
    if range_ == "1M":
        return await _get_forecast_active(db)   # mode='forecast'
    return await _get_cashflow(db, n=_range_to_n(range_))  # mode='cashflow'
```

**1M (`mode='forecast'`):**
```
projected_end_balance = starting_balance + planned_income − planned_expense
```
`starting_balance_cents` — поле `BudgetPeriod` (накопления, переносятся
при `close_period`). Факт-транзакции в формуле НЕ участвуют — намеренно:
показываем «куда придём, если выполним план», без подмешивания текущей
скорости расходов (см. SUMMARY → подходы которые отвергли).

**3M+ (`mode='cashflow'`):**
```
total_net = Σ (income_actual − expense_actual) по N последним ЗАКРЫТЫМ периодам
monthly_avg = total_net / count
```
Активный период исключён — не закрыт, факт ещё растёт.

`ForecastResponse` — discriminated union по полю `mode` (`forecast` |
`cashflow` | `empty`). Фронт ветвится в `ForecastCard` по этому полю.

### Daily trend для 1M

Старая `get_trend` агрегировала по периодам (1 точка для 1M). Новая ветка
`_get_trend_daily`: сумма `actual` по `tx_date` внутри активного периода,
с padding нулями от `period_start` до `min(period_end, today)`. Кривая
всегда непрерывна.

### Unplanned-overspend

`get_top_overspend`:
```python
# Было: category_ids = planned ∩ actual (требовался план > 0)
# Стало: category_ids = все категории с фактом-расходом
for cat_id in actual_rows:
    actual = actual_rows[cat_id]
    planned = planned_rows.get(cat_id, 0)
    if planned > 0:
        overspend_pct = actual / planned * 100  # как раньше
        sort_key = overspend_pct
    else:
        overspend_pct = None  # «Без плана»
        sort_key = float('inf')  # unplanned первыми
items.sort(key=lambda x: x['_sort'], reverse=True)
items = [it for it in items if it.overspend_pct is None or it.overspend_pct > 100]
```

Schema:
```python
class OverspendItem(BaseModel):
    overspend_pct: Optional[float] = None  # null = unplanned
```

`DashboardCategoryRow` — отдельный флаг `isUnplanned`:
```ts
const isUnplanned = !hasPlanned && hasActual;
const isOverspend = (hasPlanned && pct > 1.0) || isUnplanned;
```

Бар заполняется на 100%, бэйдж показывает «Без плана». Та же логика
в `TopOverspendList`.

### Decimal × float

```python
overspend_pct = float(actual) / float(planned) * 100.0
# было: (actual / planned) * 100.0  → TypeError
```

### 4xx → empty

В `useAnalytics`:
```ts
function isClientError(e) {
  return e instanceof ApiError && e.status >= 400 && e.status < 500;
}
.catch(e => {
  if (isClientError(e)) {
    setForecast(null); setTrend(null); ...   // empty state
  } else {
    setError(e.message);                      // 5xx — реальная ошибка
  }
})
```

`AnalyticsScreen` показывает empty-плейсхолдеры в каждой карточке вместо
скрытия — пользователь видит структуру дашборда («Прогноз», «Топ
перерасходов», «Тренд», «Топ категорий»), даже когда данных нет.

### InfoNote — раскрывающиеся объяснения

Новый компонент `frontend/src/components/InfoNote.{tsx,module.css}`:
```tsx
<details className={styles.note}>
  <summary>{Info icon}</summary>
  <div className={styles.body}>{formula}</div>
</details>
```

`details { display: contents }` — children становятся прямыми детьми
flex-родителя; `body { flex-basis: 100% }` уходит на новую строку под
заголовок секции (родитель `flex-wrap: wrap`). Без js-state, accessible.

Тексты привязаны к `range` — для 1M про прогноз, для 3M+ про cashflow.

## Затронутые файлы

Backend:
- `app/services/analytics.py` — `_get_forecast_active`, `_get_cashflow`,
  `_get_trend_daily`, новый top-overspend
- `app/api/schemas/analytics.py` — полиморфный `ForecastResponse`,
  `Optional[float]` в `OverspendItem.overspend_pct`
- `app/api/routes/analytics.py` — `range` query param в `/forecast`

Frontend:
- `frontend/src/api/types.ts` — `ForecastMode`, обновлённые типы
- `frontend/src/api/analytics.ts` — `getForecast(range)`
- `frontend/src/hooks/useAnalytics.ts` — 4xx-handling, передача range
- `frontend/src/components/ForecastCard.{tsx,module.css}` — три mode'а
- `frontend/src/components/TopOverspendList.tsx` — null-pct, «Без плана»
- `frontend/src/components/DashboardCategoryRow.tsx` — `isUnplanned`
- `frontend/src/components/InfoNote.{tsx,module.css}` (новые)
- `frontend/src/screens/AnalyticsScreen.{tsx,module.css}` — InfoNote в
  каждом sectionTitle, плейсхолдеры вместо скрытия, `flex-shrink: 0` на
  детях `.root` чтобы chips не схлопывались до 5px
