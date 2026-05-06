# 02 — Транзакции: SubTabBar Расходы/Доходы и фильтры по kind

## Проблема

Пользователь: «История сделать как План. Деление на расходы и доходы по
вкладкам. Быстрые фильтры ставить относительно вкладки (не пихать расходы
и доходы в обе вкладки)».

Что было:
- `TransactionsScreen` имел чипсы `[Все | Расходы | Доходы | Продукты | Дом
  | Машина | ...]` — одна полоса с kind-фильтрами и категориями вперемешку.
- `HistoryView` принимал `activeKindFilter: 'all' | 'expense' | 'income'`,
  но клик по чипсе категории был no-op (`/* Phase 7 discretion */`).
- В Плане SubTabBar Расходы/Доходы был внутри `PlanGroupView` (свой state),
  а в Истории — отсутствовал.

## Решение

Один `kindFilter: CategoryKind` поднят в `TransactionsScreen`, общий для
обеих вкладок (История и План):

```tsx
const [kindFilter, setKindFilter] = useState<CategoryKind>('expense');
const visibleCategories = useMemo(
  () => categories.filter(c => c.kind === kindFilter),
  [categories, kindFilter],
);

return (
  <div className={styles.wrap}>
    <div className={styles.root}>
      <SubTabBar tabs={SUB_TABS} ... />        {/* История | План */}
      <SubTabBar tabs={KIND_TABS} ... />       {/* Расходы | Доходы */}
      {visibleCategories.length > 0 && (
        <div className={styles.chips}>         {/* категории по активному kind */}
          {visibleCategories.map(cat => <button ... />)}
        </div>
      )}
      {activeSubTab === 'history' && <HistoryView activeKindFilter={kindFilter} ... />}
      {activeSubTab === 'plan' && <PlannedView activeKind={kindFilter} ... />}
    </div>
  </div>
);
```

Убран `PlanGroupView`'s internal `useState<CategoryKind>('expense')` — теперь
он принимает `activeKind` через props. Если prop передан, internal tabs
скрыты (для случая когда `PlannedView` рендерится из `TransactionsScreen`,
есть внешний SubTabBar).

Чипсы категорий теперь кликабельные — `localCategoryFilter` state в
`TransactionsScreen`, передаётся в `HistoryView` как `categoryFilter` и в
`PlannedView` как новый prop. Tap на активный чип сбрасывает фильтр.

## Затронутые файлы

- `frontend/src/screens/TransactionsScreen.{tsx,module.css}` — два SubTabBar,
  category chips по `kindFilter`, обёртка fabWrap (см. 01)
- `frontend/src/screens/PlannedView.tsx` — props `activeKind`, `categoryFilter`
- `frontend/src/components/PlanGroupView.tsx` — `activeKind` через props
  (если передан, internal tabs скрыты)
- `frontend/src/screens/HistoryView.module.css` — фон `--color-bg`

## Верификация

- На Истории и Плане одни и те же SubTab Расходы/Доходы, переключаются
  синхронно при смене верхней вкладки.
- Чипсы показывают только категории активного kind.
- Клик по чипсе фильтрует список (категория или сброс).
- Двойного SubTabBar внутри Плана нет — только тот что в TransactionsScreen.
