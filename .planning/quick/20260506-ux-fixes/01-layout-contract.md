# 01 — Layout-контракт + BottomNav + Fab

## Проблемы

1. **Страница скроллится целиком** вместо отдельных экранов. BottomNav
   «уезжал» в конец длинного контента. Корень: `.screenContainer` имел
   `min-height: 100dvh` и был свободен расти.
2. **«Дырка» между inputBar AI-чата и BottomNav.** Корень:
   `screenContainer.padding-bottom = bottom-nav-height + env(safe-area)` и
   `BottomNav.height = bottom-nav-height + env(safe-area)` рассинхронизировались —
   на части устройств safe-area считалась по-разному.
3. **Fab наезжал на BottomNav.** `position: fixed; bottom: nav.height + 16`
   привязан к viewport, а BottomNav после п.2 фиксов уже не на дне viewport.
4. **Дублирование 3 строк (`flex: 1; min-height: 0; overflow-y: auto`)** в
   8+ экранах — один экран выпадает и начинает скроллить страницу.

## Решение

### Единый layout-контракт

Новый файл `frontend/src/styles/screen.module.css`:

```css
.scrollable { flex: 1; min-height: 0; overflow-y: auto; }
.fixed      { flex: 1; min-height: 0; overflow: hidden; }
.fabWrap    { flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column; }
```

Каждый экран композирует через CSS Modules:
```css
.root { composes: scrollable from '../styles/screen.module.css'; ...specific... }
```

`scrollable` — обычные экраны, скролл внутри. `fixed` — AiScreen и
TransactionsScreen, у них собственный внутренний scroll container
(`.messages` / `.rootInner`). `fabWrap` — обёртка для экранов с Fab:
relative-ancestor для absolute-Fab, без overflow → не клипит Fab.

### BottomNav в normal flow

```
appWrapper (height: 100dvh)
  appRoot (height: 100%, display: flex column, position: relative)
    screenContainer (flex: 1, overflow: hidden)  ← все экраны рендерятся здесь
    BottomNav (flex-shrink: 0, height: 56 + safe-area)
```

Снято: `position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;` у
BottomNav.

Снято: `padding-bottom: calc(56 + safe-area)` у screenContainer (резервация
больше не нужна — BottomNav сам берёт своё место в flow).

Снято: `@media (min-width: 540px)` ручное центрирование nav — теперь nav
всегда центрируется естественно через родителя `.appRoot` (420px на десктопе).

### Fab внутри fabWrap

Структура каждого экрана с FAB:
```jsx
<div className={styles.wrap}>          {/* fabWrap: position relative */}
  <div className={styles.root}>...</div>  {/* scrollable inside */}
  <Fab ... />                           {/* absolute, не клипится */}
</div>
```

`Fab.module.css`:
```css
.fab { position: absolute; bottom: 16px; right: 24px; ... }
```

Раньше: `position: fixed; bottom: calc(nav.height + safe + 16)`. Теперь
`absolute` относительно `fabWrap`, который сидит точно в зоне над BottomNav
(не в зоне самого nav и не в padding viewport).

## Затронутые файлы

- `frontend/src/styles/screen.module.css` (новый)
- `frontend/src/App.module.css` — appWrapper height, appRoot flex column,
  screenContainer без padding-bottom
- `frontend/src/components/BottomNav.module.css` — убран fixed, остался flex-shrink
- `frontend/src/components/Fab.module.css` — fixed → absolute, bottom: 16px
- `frontend/src/screens/HomeScreen.{tsx,module.css}` — обёртка `.wrap`
- `frontend/src/screens/TransactionsScreen.{tsx,module.css}` — обёртка `.wrap`
- `frontend/src/screens/AiScreen.module.css` — composes fixed
- `frontend/src/screens/AnalyticsScreen.module.css` — composes scrollable
- `frontend/src/screens/ManagementScreen.{tsx,module.css}` — composes scrollable
- `frontend/src/screens/{Categories,Subscriptions,Template,Settings,Onboarding}Screen.module.css` — composes scrollable
- `frontend/src/screens/HistoryView.module.css` — фон `--color-bg` (был elevated)
- `frontend/src/screens/ActualScreen.module.css` — то же

## Верификация

- Playwright (Desktop Chrome 420×1000) — `inputBar.bottom == BottomNav.top`
  (gap 0px).
- На длинных экранах (Аналитика с раскрытым InfoNote, Категории с 12+
  пунктами) page не скроллится, скролл идёт внутри карточки.
- Fab остаётся на месте при скролле контента (он вне scroll container).
