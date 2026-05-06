# Post-phase-10 UX fixes — 2026-05-06

После закрытия `phase-10 AI Categorization` пользователь прошёлся по приложению
и обнаружил серию UX/архитектурных дефектов на разных экранах. Эта папка —
лог фиксов: что было, почему, как починили. Один markdown на коммит.

## Корневые проблемы, общие для нескольких экранов

1. **Layout-контракт.** Каждый экран сам объявлял `flex: 1; min-height: 0;
   overflow-y: auto` (3 строки, дублирующиеся в 8+ файлах). Один файл выпадал —
   и страница начинала скроллиться целиком, BottomNav «улетал» вниз контента.
2. **BottomNav fixed.** `position: fixed` + `padding-bottom` на screenContainer
   рассинхронизировались по `env(safe-area-inset-bottom)` — постоянная «дырка»
   между inputBar чата и nav.
3. **Caddy кэш.** index.html отдавался без `Cache-Control` — TG WebView держал
   stale shell, и фиксы вообще не подхватывались до hard reload.
4. **Палитра.** Часть компонентов (AiScreen, ChatMessage) использовали
   `var(--tg-theme-bg-color, #ffffff)` — fallback белый ломал dark-тему
   везде, где TG-переменная не выставлена.

## 5 атомарных коммитов

| # | Файл лога | Тема |
|---|-----------|------|
| 1 | [01-layout-contract.md](01-layout-contract.md) | Единый screen-контракт + BottomNav в normal flow + Fab в fabWrap |
| 2 | [02-transactions-tabs.md](02-transactions-tabs.md) | SubTabBar Расходы/Доходы в Истории и Плане, чипсы по kind |
| 3 | [03-analytics-rework.md](03-analytics-rework.md) | Полиморфный ForecastCard, unplanned-overspend, daily trend, InfoNote |
| 4 | [04-ai-cleanup.md](04-ai-cleanup.md) | Санитизация ошибок провайдера, lift state, dark-theme палитра |
| 5 | [05-infra-and-polish.md](05-infra-and-polish.md) | Caddy no-cache, Management полишинг, мелочи |

## Подходы, которые сохраняем

- **CSS Modules `composes:`** для переиспользования базовых раскладок —
  идиоматичнее глобальных классов. Файл `frontend/src/styles/screen.module.css`
  — это «design primitives» layer.
- **Полиморфный response (mode-discriminator)** для `/analytics/forecast` —
  проще, чем два endpoint'а; фронт ветвится по `mode === 'forecast' | 'cashflow'
  | 'empty'`.
- **`<details>` с `display: contents`** для info-сносок — нативная
  доступность без управления state, body уходит на новую строку через
  `flex-wrap: wrap` родителя.
- **Санитизация ошибок наружу** — `str(exc)` от провайдера никогда не
  попадает в SSE-стрим; маппится в человекочитаемые строки по `status_code`.
- **План = бюджетный потолок** — без 1:1 связи план/факт; для unplanned
  (план = 0) `overspend_pct = null`, фронт рендерит «Без плана».

## Подходы, которые отвергли

- **Daily-rate burndown forecast** (`actual_expense / days_elapsed *
  remaining_days`) — наивная экстраполяция, игнорирует подписки и неравномерное
  распределение трат. Заменили формулой через план и `starting_balance_cents`.
- **`MAX(0, planned − actual)`** как «remaining» — даёт ложный оптимизм,
  если пользователь продолжает тратить за пределами плана. Решение: не
  считать remaining через план вообще, а показать два числа (план vs
  cashflow по факту) — пока в этой версии 1M = только план, 3M+ = только
  факт, без смешивания.
- **`margin: auto` для empty-state чата** — центрирует но даёт «дырку»
  снизу. Заменили на `justify-content: flex-end` (паттерн ChatGPT/Claude).
- **`position: fixed` для BottomNav и Fab** — рассинхрон по safe-area;
  заменили на normal flow для nav и `position: absolute` в обёртке для Fab.
