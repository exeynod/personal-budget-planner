# v0.3 Research — Stream D: UI/UX Patterns & Wireframes

**Researched:** 2026-05-05
**Domain:** UX-паттерны, wireframes, chart library selection, design tokens для новых фич
**Confidence:** HIGH на chart bundle sizes (npm data); HIGH на UX-паттернах (конкурентный анализ); HIGH на wireframes (соответствие установленным токенам)
**Scope:** 4 новые фичи — аналитика, AI-чат, admin whitelist, AI-категоризация в bottom-sheet

---

## 1. Конкурентный анализ

| Приложение | Аналитика | AI-интеграция | Навигация | Ключевые паттерны |
|---|---|---|---|---|
| **YNAB** | Отдельная вкладка «Reports», bar + trend charts, period comparison side-by-side | Нет | Bottom tab bar (5 пунктов) | Grouped spending bars, net worth timeline, color-coded categories |
| **Cleo** | Встроена в главный экран как скроллируемые карточки, emoji-статистика | AI-чат — central feature, FAB или отдельная вкладка, suggested prompts как chips | Bottom tab + FAB | Conversational UI первична, данные вторичны; typing indicator с «...»; tool-progress: «Looking at your March data» |
| **Copilot Money** | Hero-карта чистого потока, sparklines в списке категорий, отдельный drill-down | GPT-интеграция — inline tooltip, не полноценный чат | Tab bar (4 пунктов) | Grouped bar charts, санки-диаграмма потоков, компактный period switcher |
| **Дзен-мани** | Вкладка «Отчёты», круговая диаграмма расходов по категориям, список сверху | Нет | Bottom tab bar | Pie/donut как primary chart, список под диаграммой, русскоязычные label-ы |
| **Revolut** | Карточки-статистика в главном feed, отдельная «Analytics» вкладка | Robo-advisor (не чат) | 5-вкладочная nav | Плотные list-cards с sparklines, horizontal scroll categories, no drill-down overflow |
| **Tinkoff** | Hero-карта баланса с mini chart, отдельная аналитика | Oleg (chatbot) на отдельном экране | Tab bar + drawer | Premium gradients на hero, tabular numbers строго, category icons circle |

**Ключевые паттерны из анализа:**

- **Аналитика**: все premium-приложения используют отдельную вкладку, не секцию на главном. Trend chart сверху (bar или line), top-categories список снизу — стандартная раскладка.
- **AI-чат**: Cleo — эталон. FAB на главном → полноэкранный чат. Chips под пустым чатом. Tool-progress как inline banner «Looking at your data...». Пузыри: user справа (primary color), AI слева (surface card).
- **Admin screens**: минималистичны, table-view на desktop, list-view на mobile, Revoke — красная кнопка + confirm sheet.
- **AI-категоризация**: inline suggestion badge с иконкой робота, одна кнопка «Изменить» — паттерн Gmail Smart Compose.

---

## 2. Chart Library: рекомендация

| Библиотека | Gzip bundle | 375px поддержка | Tree-shaking | SVG/Canvas | Решение |
|---|---|---|---|---|---|
| **Recharts** | ~95 KB | Хорошая, ResponsiveContainer | Частичный | SVG | **Рекомендуется** |
| **ApexCharts** | ~160 KB | Хорошая | Нет (монолит) | SVG + Canvas | Избыточно |
| **lightweight-charts (TradingView)** | ~45 KB | Отличная | Да | Canvas | Только финансовые (OHLC), нет bar |
| **Chart.js** | ~65 KB (tree-shaken) | Хорошая | Да (v4) | Canvas | Альтернатива |
| **Visx (Airbnb)** | ~30 KB per chart | Требует настройки | Да | SVG | Сложна в настройке |

**Рекомендация: Recharts.**

Аргументы:
1. Декларативный React API — нет `useEffect` на инициализацию.
2. ResponsiveContainer автоматически адаптирует width к viewport 375px.
3. Tree-shaking по компонентам: импортируем только `BarChart`, `LineChart`, `ResponsiveContainer`, `Tooltip` — реальный bundle ~35-40 KB gzip.
4. SVG-рендер: читается accessibility-деревом, нет canvas blur на retina.
5. Кастомный Tooltip с dark theme — через `contentStyle` prop, без CSS override.

Альтернатива: Chart.js если потребуется Canvas (анимации smoother на low-end), но требует imperative ref API.

**Что НЕ использовать**: ApexCharts — 160 KB неоправданы для 2-3 типов графиков. lightweight-charts — специализирован под OHLC свечи, bar chart отсутствует.

---

## 3. Wireframe 1 — Экран аналитики

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=375, initial-scale=1">
<title>Аналитика</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0e1116;
    color: #f3f5f9;
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 15px;
    width: 375px;
    min-height: 812px;
    -webkit-font-smoothing: antialiased;
  }

  /* Top nav */
  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 0;
    height: 52px;
  }
  .nav-title {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.3px;
  }
  .nav-period {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #1c2230;
    border-radius: 20px;
    padding: 6px 12px;
    font-size: 13px;
    color: #8e98ad;
    cursor: pointer;
  }
  .nav-period span { color: #f3f5f9; font-weight: 500; }

  /* Period tabs */
  .period-tabs {
    display: flex;
    gap: 6px;
    padding: 12px 16px 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .period-tabs::-webkit-scrollbar { display: none; }
  .tab-chip {
    flex-shrink: 0;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
    background: #1c2230;
    color: #8e98ad;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .tab-chip.active {
    background: rgba(78, 164, 255, 0.14);
    color: #4ea4ff;
    border-color: rgba(78, 164, 255, 0.3);
  }

  /* Summary cards */
  .summary-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 12px 16px 0;
  }
  .summary-card {
    background: #1c2230;
    border-radius: 14px;
    padding: 14px;
  }
  .summary-card .label {
    font-size: 11px;
    color: #8e98ad;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .summary-card .amount {
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.5px;
  }
  .summary-card .delta {
    font-size: 11px;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .green { color: #2ecc71; }
  .red { color: #ff5d5d; }
  .muted { color: #8e98ad; }

  /* Section header */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 16px 8px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: #8e98ad;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .section-link {
    font-size: 13px;
    color: #4ea4ff;
  }

  /* Chart area */
  .chart-card {
    margin: 0 16px;
    background: #1c2230;
    border-radius: 14px;
    padding: 16px;
  }
  .chart-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .chart-subtitle {
    font-size: 11px;
    color: #8e98ad;
    margin-bottom: 16px;
  }

  /* Bar chart mock */
  .bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 100px;
    padding: 0 4px;
  }
  .bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
    justify-content: flex-end;
  }
  .bar-fact {
    width: 100%;
    background: #4ea4ff;
    border-radius: 4px 4px 0 0;
    min-height: 4px;
  }
  .bar-plan {
    width: 100%;
    background: rgba(78, 164, 255, 0.25);
    border-radius: 4px 4px 0 0;
    min-height: 4px;
    border: 1px dashed rgba(78, 164, 255, 0.4);
    border-bottom: none;
  }
  .bar-label {
    font-size: 10px;
    color: #5d6577;
    margin-top: 4px;
  }
  .bar-current .bar-fact { background: #ffd166; }

  /* Chart legend */
  .chart-legend {
    display: flex;
    gap: 16px;
    margin-top: 12px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #8e98ad;
  }
  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
  .dot-fact { background: #4ea4ff; }
  .dot-plan { background: rgba(78, 164, 255, 0.35); border: 1px dashed rgba(78,164,255,0.5); }
  .dot-current { background: #ffd166; }

  /* Top categories */
  .category-list {
    margin: 0 16px;
    background: #1c2230;
    border-radius: 14px;
    overflow: hidden;
  }
  .category-row {
    display: flex;
    align-items: center;
    padding: 12px 14px;
    gap: 10px;
    border-bottom: 1px solid #232a3a;
  }
  .category-row:last-child { border-bottom: none; }
  .cat-rank {
    font-size: 13px;
    color: #5d6577;
    font-variant-numeric: tabular-nums;
    width: 18px;
    text-align: center;
    flex-shrink: 0;
  }
  .cat-info {
    flex: 1;
    min-width: 0;
  }
  .cat-name {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cat-bar-wrap {
    height: 3px;
    background: #2a3142;
    border-radius: 2px;
    margin-top: 5px;
    overflow: hidden;
  }
  .cat-bar-fill {
    height: 100%;
    border-radius: 2px;
    background: #4ea4ff;
  }
  .cat-amount {
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .cat-delta {
    font-size: 11px;
    flex-shrink: 0;
  }

  /* Forecast card */
  .forecast-card {
    margin: 8px 16px 0;
    background: linear-gradient(135deg, #1d2740 0%, #2d1d40 100%);
    border-radius: 14px;
    padding: 16px;
    border: 1px solid rgba(78, 164, 255, 0.15);
  }
  .forecast-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .forecast-icon {
    width: 28px;
    height: 28px;
    background: rgba(78, 164, 255, 0.15);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }
  .forecast-title { font-size: 13px; font-weight: 600; }
  .forecast-amount {
    font-size: 24px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.5px;
    color: #4ea4ff;
  }
  .forecast-sub { font-size: 12px; color: #8e98ad; margin-top: 4px; }

  /* Bottom nav */
  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 375px;
    height: 56px;
    background: #161a22;
    border-top: 1px solid #2a3142;
    display: flex;
    align-items: center;
  }
  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 8px 0;
    cursor: pointer;
  }
  .nav-item .icon { font-size: 20px; opacity: 0.4; }
  .nav-item .icon-label { font-size: 10px; color: #5d6577; }
  .nav-item.active .icon { opacity: 1; }
  .nav-item.active .icon-label { color: #4ea4ff; }

  /* Scrollable main */
  .main {
    padding-bottom: 80px;
    overflow-y: auto;
    height: 812px;
  }
</style>
</head>
<body>

<div class="main">
  <!-- Nav -->
  <div class="nav">
    <span class="nav-title">Аналитика</span>
    <div class="nav-period">
      <span>Апр 2026</span>
      ▾
    </div>
  </div>

  <!-- Period tabs -->
  <div class="period-tabs">
    <div class="tab-chip">3 мес</div>
    <div class="tab-chip active">6 мес</div>
    <div class="tab-chip">12 мес</div>
    <div class="tab-chip">Всё время</div>
  </div>

  <!-- Summary row -->
  <div class="summary-row">
    <div class="summary-card">
      <div class="label">Расходы (факт)</div>
      <div class="amount red">42 180 ₽</div>
      <div class="delta red">▲ +8% к марту</div>
    </div>
    <div class="summary-card">
      <div class="label">Экономия</div>
      <div class="amount green">12 820 ₽</div>
      <div class="delta green">▼ −3% к плану</div>
    </div>
  </div>

  <!-- Trend chart -->
  <div class="section-header">
    <span class="section-title">Тренд расходов</span>
    <span class="section-link">план / факт</span>
  </div>
  <div class="chart-card">
    <div class="chart-title">Расходы по месяцам</div>
    <div class="chart-subtitle">ноябрь 2025 — апрель 2026</div>
    <div class="bar-chart">
      <div class="bar-col">
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;height:80px;justify-content:flex-end;gap:2px;">
          <div class="bar-fact" style="height:52px;"></div>
        </div>
        <div class="bar-label">ноя</div>
      </div>
      <div class="bar-col">
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;height:80px;justify-content:flex-end;gap:2px;">
          <div class="bar-fact" style="height:68px;"></div>
        </div>
        <div class="bar-label">дек</div>
      </div>
      <div class="bar-col">
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;height:80px;justify-content:flex-end;gap:2px;">
          <div class="bar-fact" style="height:44px;"></div>
        </div>
        <div class="bar-label">янв</div>
      </div>
      <div class="bar-col">
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;height:80px;justify-content:flex-end;gap:2px;">
          <div class="bar-fact" style="height:58px;"></div>
        </div>
        <div class="bar-label">фев</div>
      </div>
      <div class="bar-col">
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;height:80px;justify-content:flex-end;gap:2px;">
          <div class="bar-fact" style="height:50px;"></div>
        </div>
        <div class="bar-label">мар</div>
      </div>
      <div class="bar-col bar-current">
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;height:80px;justify-content:flex-end;gap:2px;">
          <div style="width:100%;height:75px;background:rgba(255,209,102,0.25);border-radius:4px 4px 0 0;border:1px dashed rgba(255,209,102,0.4);border-bottom:none;position:relative;">
            <div style="position:absolute;bottom:0;left:0;right:0;height:54px;background:#ffd166;border-radius:4px 4px 0 0;"></div>
          </div>
        </div>
        <div class="bar-label" style="color:#ffd166;">апр</div>
      </div>
    </div>
    <div class="chart-legend">
      <div class="legend-item"><div class="legend-dot dot-fact"></div>Факт</div>
      <div class="legend-item"><div class="legend-dot dot-plan"></div>План</div>
      <div class="legend-item"><div class="legend-dot dot-current"></div>Тек. месяц</div>
    </div>
  </div>

  <!-- Top categories -->
  <div class="section-header">
    <span class="section-title">Топ-5 категорий</span>
    <span class="section-link">все</span>
  </div>
  <div class="category-list">
    <div class="category-row">
      <div class="cat-rank">1</div>
      <div class="cat-info">
        <div class="cat-name">Продукты</div>
        <div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:100%"></div></div>
      </div>
      <div class="cat-amount">14 320 ₽</div>
      <div class="cat-delta red">▲+12%</div>
    </div>
    <div class="category-row">
      <div class="cat-rank">2</div>
      <div class="cat-info">
        <div class="cat-name">Кафе и рестораны</div>
        <div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:62%"></div></div>
      </div>
      <div class="cat-amount">8 940 ₽</div>
      <div class="cat-delta green">▼−5%</div>
    </div>
    <div class="category-row">
      <div class="cat-rank">3</div>
      <div class="cat-info">
        <div class="cat-name">Транспорт</div>
        <div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:44%"></div></div>
      </div>
      <div class="cat-amount">6 300 ₽</div>
      <div class="cat-delta muted">= 0%</div>
    </div>
    <div class="category-row">
      <div class="cat-rank">4</div>
      <div class="cat-info">
        <div class="cat-name">Здоровье</div>
        <div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:30%"></div></div>
      </div>
      <div class="cat-amount">4 280 ₽</div>
      <div class="cat-delta green">▼−18%</div>
    </div>
    <div class="category-row">
      <div class="cat-rank">5</div>
      <div class="cat-info">
        <div class="cat-name">Подписки</div>
        <div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:24%"></div></div>
      </div>
      <div class="cat-amount">3 490 ₽</div>
      <div class="cat-delta muted">= 0%</div>
    </div>
  </div>

  <!-- Forecast -->
  <div class="section-header">
    <span class="section-title">Прогноз</span>
    <span></span>
  </div>
  <div class="forecast-card">
    <div class="forecast-header">
      <div class="forecast-icon">&#x2728;</div>
      <div class="forecast-title">Прогноз на конец апреля</div>
    </div>
    <div class="forecast-amount">54 600 ₽</div>
    <div class="forecast-sub">На основе темпа трат за первые 15 дней. Перерасход плана +9%</div>
  </div>

  <!-- spacer -->
  <div style="height:24px;"></div>
</div>

<!-- Bottom nav -->
<div class="bottom-nav">
  <div class="nav-item">
    <div class="icon">&#x2302;</div>
    <div class="icon-label">Главная</div>
  </div>
  <div class="nav-item">
    <div class="icon">&#x1F4CB;</div>
    <div class="icon-label">Факт</div>
  </div>
  <div class="nav-item active">
    <div class="icon">&#x1F4CA;</div>
    <div class="icon-label" style="color:#4ea4ff;">Аналитика</div>
  </div>
  <div class="nav-item">
    <div class="icon">&#x1F916;</div>
    <div class="icon-label">ИИ</div>
  </div>
  <div class="nav-item">
    <div class="icon">&#x22EF;</div>
    <div class="icon-label">Ещё</div>
  </div>
</div>

</body>
</html>
```

---

## 4. Wireframe 2 — AI-чат

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=375, initial-scale=1">
<title>ИИ-ассистент</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0e1116;
    color: #f3f5f9;
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 15px;
    width: 375px;
    height: 812px;
    display: flex;
    flex-direction: column;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  /* Header */
  .chat-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    border-bottom: 1px solid #2a3142;
    flex-shrink: 0;
    background: #0e1116;
  }
  .ai-avatar {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #4ea4ff 0%, #6366F1 100%);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .ai-name { font-size: 15px; font-weight: 600; }
  .ai-subtitle { font-size: 12px; color: #8e98ad; }
  .ai-status {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #2ecc71;
  }
  .ai-status-dot {
    width: 7px;
    height: 7px;
    background: #2ecc71;
    border-radius: 50%;
  }

  /* Scrollable messages area */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    scrollbar-width: none;
  }
  .messages::-webkit-scrollbar { display: none; }

  /* Empty state / chips */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 0 16px;
    gap: 8px;
  }
  .empty-icon {
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, rgba(78,164,255,0.15), rgba(99,102,241,0.15));
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
  }
  .empty-title { font-size: 17px; font-weight: 600; margin-top: 4px; }
  .empty-sub { font-size: 13px; color: #8e98ad; text-align: center; line-height: 1.4; }

  .chips-section { width: 100%; }
  .chips-label { font-size: 11px; color: #5d6577; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .chips-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chip {
    background: #1c2230;
    border: 1px solid #2a3142;
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 14px;
    color: #f3f5f9;
    cursor: pointer;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .chip:hover { background: #232a3a; border-color: rgba(78,164,255,0.3); }
  .chip-icon { font-size: 18px; flex-shrink: 0; }

  /* Message bubbles */
  .msg-user {
    align-self: flex-end;
    max-width: 80%;
    background: #4ea4ff;
    color: #0e1116;
    border-radius: 18px 18px 4px 18px;
    padding: 10px 14px;
    font-size: 14px;
    line-height: 1.4;
    font-weight: 500;
  }

  .msg-ai-wrap {
    align-self: flex-start;
    max-width: 88%;
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .msg-ai-avatar {
    width: 28px;
    height: 28px;
    background: linear-gradient(135deg, #4ea4ff, #6366F1);
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .msg-ai {
    background: #1c2230;
    border-radius: 18px 18px 18px 4px;
    padding: 10px 14px;
    font-size: 14px;
    line-height: 1.5;
    border: 1px solid #2a3142;
  }

  /* Tool-use progress banner */
  .tool-progress {
    align-self: flex-start;
    max-width: 88%;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .tool-progress-inner {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(78,164,255,0.08);
    border: 1px solid rgba(78,164,255,0.2);
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 13px;
    color: #8e98ad;
  }
  .tool-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(78,164,255,0.3);
    border-top-color: #4ea4ff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Typing indicator */
  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .typing-avatar {
    width: 28px;
    height: 28px;
    background: linear-gradient(135deg, #4ea4ff, #6366F1);
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }
  .typing-bubble {
    background: #1c2230;
    border-radius: 18px 18px 18px 4px;
    padding: 12px 16px;
    border: 1px solid #2a3142;
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .dot-bounce {
    width: 6px;
    height: 6px;
    background: #8e98ad;
    border-radius: 50%;
    animation: bounce 1.2s infinite;
  }
  .dot-bounce:nth-child(2) { animation-delay: 0.2s; }
  .dot-bounce:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-6px); }
  }

  /* AI response with data card */
  .data-card {
    background: rgba(78,164,255,0.06);
    border: 1px solid rgba(78,164,255,0.15);
    border-radius: 10px;
    padding: 10px 12px;
    margin-top: 8px;
    font-size: 13px;
  }
  .data-card-row {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    font-variant-numeric: tabular-nums;
  }
  .data-card-row .val { font-weight: 600; }
  .data-card-row .val.green { color: #2ecc71; }
  .data-card-row .val.red { color: #ff5d5d; }

  /* Input bar */
  .input-bar {
    flex-shrink: 0;
    padding: 12px 16px 28px;
    background: #161a22;
    border-top: 1px solid #2a3142;
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }
  .input-wrap {
    flex: 1;
    background: #1c2230;
    border: 1px solid #2a3142;
    border-radius: 20px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
  }
  .input-placeholder {
    font-size: 14px;
    color: #5d6577;
    flex: 1;
  }
  .send-btn {
    width: 38px;
    height: 38px;
    background: #4ea4ff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    flex-shrink: 0;
  }
</style>
</head>
<body>

<!-- Header -->
<div class="chat-header">
  <div class="ai-avatar">&#x1F916;</div>
  <div>
    <div class="ai-name">Бюджет-ИИ</div>
    <div class="ai-subtitle">Знает ваши расходы</div>
  </div>
  <div class="ai-status">
    <div class="ai-status-dot"></div>
    онлайн
  </div>
</div>

<!-- Messages -->
<div class="messages">

  <!-- STATE A: Пустой чат (закомментировать если показываем STATE B) -->
  <div class="empty-state">
    <div class="empty-icon">&#x1F4AC;</div>
    <div class="empty-title">Спросите про бюджет</div>
    <div class="empty-sub">Задайте вопрос в свободной форме — проанализирую ваши данные</div>
  </div>

  <div class="chips-section">
    <div class="chips-label">Частые вопросы</div>
    <div class="chips-grid">
      <div class="chip">
        <div class="chip-icon">&#x1F4CA;</div>
        Сколько потратил на еду в апреле?
      </div>
      <div class="chip">
        <div class="chip-icon">&#x1F4C5;</div>
        Сравни март и апрель по расходам
      </div>
      <div class="chip">
        <div class="chip-icon">&#x1F3AF;</div>
        На что трачу больше всего?
      </div>
      <div class="chip">
        <div class="chip-icon">&#x1F50D;</div>
        Найди трату «такси» за последний месяц
      </div>
    </div>
  </div>

  <!-- Разделитель — STATE B ниже показывает активный диалог -->
  <div style="height:16px;border-top:1px solid #1c2230;margin-top:8px;"></div>

  <!-- STATE B: Активный диалог -->
  <div class="msg-user">Сколько я потратил на еду и кафе в апреле?</div>

  <!-- Tool progress -->
  <div class="tool-progress">
    <div class="tool-progress-inner">
      <div class="tool-spinner"></div>
      Смотрю траты по категориям за апрель...
    </div>
  </div>

  <!-- AI ответ с данными -->
  <div class="msg-ai-wrap">
    <div class="msg-ai-avatar">&#x1F916;</div>
    <div>
      <div class="msg-ai">
        В апреле на <strong>Продукты</strong> и <strong>Кафе</strong> вместе — 23 260 ₽. Это 55% от всех расходов за месяц.
        <div class="data-card">
          <div class="data-card-row">
            <span>Продукты</span>
            <span class="val">14 320 ₽</span>
          </div>
          <div class="data-card-row">
            <span>Кафе и рестораны</span>
            <span class="val">8 940 ₽</span>
          </div>
          <div class="data-card-row" style="border-top:1px solid rgba(78,164,255,0.15);margin-top:4px;padding-top:6px;">
            <span>Итого</span>
            <span class="val">23 260 ₽</span>
          </div>
          <div class="data-card-row">
            <span>vs план</span>
            <span class="val red">+3 260 ₽ перерасход</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="msg-user">А как это по сравнению с мартом?</div>

  <!-- Typing indicator -->
  <div class="typing-indicator">
    <div class="typing-avatar">&#x1F916;</div>
    <div class="typing-bubble">
      <div class="dot-bounce"></div>
      <div class="dot-bounce"></div>
      <div class="dot-bounce"></div>
    </div>
  </div>

</div>

<!-- Input bar -->
<div class="input-bar">
  <div class="input-wrap">
    <div class="input-placeholder">Спросите что-нибудь...</div>
  </div>
  <div class="send-btn">&#x2191;</div>
</div>

</body>
</html>
```

---

## 5. Wireframe 3 — Admin whitelist

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=375, initial-scale=1">
<title>Whitelist</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0e1116;
    color: #f3f5f9;
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 15px;
    width: 375px;
    min-height: 812px;
    -webkit-font-smoothing: antialiased;
  }

  /* Nav */
  .nav {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid #1f2532;
  }
  .back-btn {
    font-size: 20px;
    color: #4ea4ff;
    cursor: pointer;
    line-height: 1;
  }
  .nav-title { font-size: 17px; font-weight: 600; }
  .nav-badge {
    margin-left: auto;
    background: rgba(78,164,255,0.12);
    color: #4ea4ff;
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 20px;
    border: 1px solid rgba(78,164,255,0.25);
  }

  /* Owner info bar */
  .owner-bar {
    margin: 12px 16px;
    background: rgba(46,204,113,0.08);
    border: 1px solid rgba(46,204,113,0.2);
    border-radius: 10px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: #8e98ad;
  }
  .owner-crown { font-size: 18px; }
  .owner-text strong { color: #2ecc71; }

  /* Section header */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 8px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: #8e98ad;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(78,164,255,0.12);
    color: #4ea4ff;
    font-size: 13px;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 20px;
    cursor: pointer;
    border: 1px solid rgba(78,164,255,0.25);
  }

  /* User list */
  .user-list {
    margin: 0 16px;
    background: #1c2230;
    border-radius: 14px;
    overflow: hidden;
  }
  .user-row {
    display: flex;
    align-items: center;
    padding: 12px 14px;
    gap: 12px;
    border-bottom: 1px solid #232a3a;
  }
  .user-row:last-child { border-bottom: none; }
  .user-avatar {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .avatar-a { background: linear-gradient(135deg, #4ea4ff, #6366F1); color: #fff; }
  .avatar-b { background: linear-gradient(135deg, #2ecc71, #1a9e56); color: #fff; }
  .avatar-c { background: linear-gradient(135deg, #ffd166, #e6a30c); color: #1a1a24; }

  .user-info { flex: 1; min-width: 0; }
  .user-name {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .user-meta {
    font-size: 11px;
    color: #5d6577;
    margin-top: 2px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .user-meta .active-dot {
    width: 5px;
    height: 5px;
    background: #2ecc71;
    border-radius: 50%;
    display: inline-block;
  }

  .revoke-btn {
    padding: 6px 12px;
    background: rgba(255,93,93,0.1);
    color: #ff5d5d;
    font-size: 12px;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid rgba(255,93,93,0.25);
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .revoke-btn:hover { background: rgba(255,93,93,0.2); }

  /* Empty slot suggestion */
  .empty-slot {
    margin: 8px 16px 0;
    border: 1px dashed #2a3142;
    border-radius: 14px;
    padding: 20px;
    text-align: center;
    color: #5d6577;
    font-size: 13px;
    cursor: pointer;
  }
  .empty-slot:hover { border-color: rgba(78,164,255,0.3); color: #8e98ad; }

  /* Bottom sheet overlay */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: flex-end;
    width: 375px;
  }
  .bottom-sheet {
    background: #1c2230;
    border-radius: 20px 20px 0 0;
    width: 100%;
    padding: 20px 20px 36px;
  }
  .sheet-handle {
    width: 36px;
    height: 4px;
    background: #2a3142;
    border-radius: 2px;
    margin: 0 auto 20px;
  }
  .sheet-title { font-size: 17px; font-weight: 600; margin-bottom: 4px; }
  .sheet-sub { font-size: 13px; color: #8e98ad; margin-bottom: 20px; }

  .input-field {
    background: #232a3a;
    border: 1px solid #2a3142;
    border-radius: 12px;
    padding: 14px;
    font-size: 15px;
    color: #f3f5f9;
    width: 100%;
    font-family: inherit;
    margin-bottom: 8px;
  }
  .input-field:focus {
    outline: none;
    border-color: #4ea4ff;
  }
  .input-hint {
    font-size: 12px;
    color: #5d6577;
    margin-bottom: 20px;
    padding: 0 2px;
  }

  .sheet-actions { display: flex; gap: 8px; }
  .btn-cancel {
    flex: 1;
    padding: 14px;
    background: #232a3a;
    color: #8e98ad;
    font-size: 15px;
    font-weight: 600;
    border-radius: 12px;
    text-align: center;
    cursor: pointer;
  }
  .btn-confirm {
    flex: 2;
    padding: 14px;
    background: #4ea4ff;
    color: #0e1116;
    font-size: 15px;
    font-weight: 700;
    border-radius: 12px;
    text-align: center;
    cursor: pointer;
  }

  /* Confirm revoke sheet */
  .confirm-sheet {
    background: #1c2230;
    border-radius: 20px 20px 0 0;
    width: 100%;
    padding: 20px 20px 36px;
  }
  .confirm-icon {
    width: 52px;
    height: 52px;
    background: rgba(255,93,93,0.12);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    margin: 0 auto 16px;
  }
  .confirm-title {
    font-size: 17px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 8px;
  }
  .confirm-desc {
    font-size: 14px;
    color: #8e98ad;
    text-align: center;
    line-height: 1.5;
    margin-bottom: 24px;
  }
  .btn-revoke {
    width: 100%;
    padding: 14px;
    background: #ff5d5d;
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    border-radius: 12px;
    text-align: center;
    cursor: pointer;
    margin-bottom: 8px;
  }
  .btn-revoke-cancel {
    width: 100%;
    padding: 14px;
    background: transparent;
    color: #8e98ad;
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    cursor: pointer;
  }
</style>
</head>
<body>

<!-- Main screen -->
<div class="nav">
  <div class="back-btn">&#x2190;</div>
  <div class="nav-title">Whitelist</div>
  <div class="nav-badge">3 из 10</div>
</div>

<div class="owner-bar">
  <div class="owner-crown">&#x1F451;</div>
  <div class="owner-text">Вы — <strong>владелец</strong>. Другие пользователи видят только свои данные.</div>
</div>

<div class="section-header">
  <span class="section-title">Допущенные</span>
  <div class="add-btn">+ Добавить</div>
</div>

<div class="user-list">
  <div class="user-row">
    <div class="user-avatar avatar-a">А</div>
    <div class="user-info">
      <div class="user-name">@anna_budget</div>
      <div class="user-meta">
        <span class="active-dot"></span>
        Был(а) сегодня · с 12 апр 2026
      </div>
    </div>
    <div class="revoke-btn">Убрать</div>
  </div>
  <div class="user-row">
    <div class="user-avatar avatar-b">М</div>
    <div class="user-info">
      <div class="user-name">@mike_fin</div>
      <div class="user-meta">3 дня назад · с 1 мар 2026</div>
    </div>
    <div class="revoke-btn">Убрать</div>
  </div>
  <div class="user-row">
    <div class="user-avatar avatar-c">О</div>
    <div class="user-info">
      <div class="user-name">@olga_test</div>
      <div class="user-meta">2 нед назад · с 10 фев 2026</div>
    </div>
    <div class="revoke-btn">Убрать</div>
  </div>
</div>

<div class="empty-slot">
  + Добавить пользователя
</div>

<!-- Bottom sheet: добавить пользователя -->
<div class="overlay" style="display:none;">
  <div class="bottom-sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">Добавить пользователя</div>
    <div class="sheet-sub">Введите Telegram User ID нового участника</div>
    <input class="input-field" type="text" placeholder="123456789" value="">
    <div class="input-hint">User ID можно получить через @userinfobot в Telegram</div>
    <div class="sheet-actions">
      <div class="btn-cancel">Отмена</div>
      <div class="btn-confirm">Добавить</div>
    </div>
  </div>
</div>

<!-- Bottom sheet: подтверждение Revoke — показываем поверх -->
<div class="overlay">
  <div class="confirm-sheet">
    <div class="sheet-handle"></div>
    <div class="confirm-icon">&#x26D4;</div>
    <div class="confirm-title">Убрать @anna_budget?</div>
    <div class="confirm-desc">
      Пользователь потеряет доступ к приложению. Данные сохранятся, но войти снова он сможет только после повторного добавления.
    </div>
    <div class="btn-revoke">Да, убрать доступ</div>
    <div class="btn-revoke-cancel">Отмена</div>
  </div>
</div>

</body>
</html>
```

---

## 6. Wireframe 4 — Bottom-sheet с AI-категоризацией

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=375, initial-scale=1">
<title>Добавить трату</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: rgba(0,0,0,0.7);
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 15px;
    width: 375px;
    height: 812px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-end;
    -webkit-font-smoothing: antialiased;
    position: relative;
    overflow: hidden;
  }

  /* Blurred background hint of main screen */
  .bg-hint {
    position: absolute;
    inset: 0;
    background: #0e1116;
    display: flex;
    flex-direction: column;
    padding: 16px;
    filter: blur(2px);
    opacity: 0.4;
    pointer-events: none;
  }
  .bg-row {
    display: flex;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid #1c2230;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .bg-label { color: #8e98ad; }
  .bg-val { font-weight: 600; }

  /* Bottom sheet */
  .sheet {
    position: relative;
    background: #1c2230;
    border-radius: 20px 20px 0 0;
    width: 375px;
    padding: 12px 20px 36px;
    z-index: 10;
  }
  .handle {
    width: 36px;
    height: 4px;
    background: #2a3142;
    border-radius: 2px;
    margin: 0 auto 20px;
  }
  .sheet-title {
    font-size: 17px;
    font-weight: 700;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .close-btn { color: #5d6577; cursor: pointer; font-size: 20px; }

  /* Form fields */
  .field-group { margin-bottom: 16px; }
  .field-label {
    font-size: 12px;
    font-weight: 600;
    color: #8e98ad;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  .field-input {
    background: #232a3a;
    border: 1px solid #2a3142;
    border-radius: 12px;
    padding: 14px;
    font-size: 15px;
    color: #f3f5f9;
    width: 100%;
    font-family: inherit;
    font-variant-numeric: tabular-nums;
  }
  .field-input:focus { outline: none; border-color: #4ea4ff; }
  .field-input.focused { border-color: #4ea4ff; }

  /* Amount special styling */
  .amount-row {
    display: flex;
    gap: 8px;
  }
  .amount-input {
    flex: 1;
    background: #232a3a;
    border: 1px solid #4ea4ff;
    border-radius: 12px;
    padding: 14px;
    font-size: 22px;
    font-weight: 700;
    color: #f3f5f9;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.5px;
  }
  .currency-badge {
    background: #232a3a;
    border: 1px solid #2a3142;
    border-radius: 12px;
    padding: 14px 16px;
    font-size: 17px;
    font-weight: 700;
    color: #8e98ad;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Category field — 3 states */

  /* State 1: Normal */
  .category-field {
    background: #232a3a;
    border: 1px solid #2a3142;
    border-radius: 12px;
    padding: 14px;
    font-size: 15px;
    color: #f3f5f9;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }
  .category-field .cat-placeholder { color: #5d6577; }
  .category-field .chevron { color: #5d6577; }

  /* State 2: Shimmer loading */
  .shimmer {
    background: linear-gradient(90deg, #232a3a 25%, #2a3142 50%, #232a3a 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
    border-radius: 12px;
    height: 48px;
  }
  @keyframes shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }
  .shimmer-label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 12px;
    color: #5d6577;
  }
  .shimmer-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(78,164,255,0.3);
    border-top-color: #4ea4ff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* State 3: AI suggestion */
  .ai-suggestion {
    background: rgba(78,164,255,0.06);
    border: 1px solid rgba(78,164,255,0.25);
    border-radius: 12px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ai-badge {
    background: rgba(99,102,241,0.15);
    border: 1px solid rgba(99,102,241,0.3);
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 11px;
    color: #a5b4fc;
    font-weight: 600;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .ai-suggestion-name {
    flex: 1;
    font-size: 15px;
    font-weight: 600;
    color: #f3f5f9;
  }
  .ai-change-btn {
    font-size: 13px;
    color: #4ea4ff;
    cursor: pointer;
    flex-shrink: 0;
    padding: 4px 8px;
    background: rgba(78,164,255,0.1);
    border-radius: 6px;
  }

  /* Confidence indicator */
  .confidence-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    font-size: 11px;
    color: #5d6577;
  }
  .confidence-bar {
    flex: 1;
    height: 3px;
    background: #232a3a;
    border-radius: 2px;
    overflow: hidden;
  }
  .confidence-fill {
    height: 100%;
    border-radius: 2px;
    background: #2ecc71;
  }

  /* Kind tabs */
  .kind-tabs {
    display: flex;
    gap: 6px;
    background: #232a3a;
    border-radius: 10px;
    padding: 4px;
  }
  .kind-tab {
    flex: 1;
    padding: 8px;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    color: #5d6577;
  }
  .kind-tab.active {
    background: #1c2230;
    color: #f3f5f9;
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
  }

  /* Date row */
  .date-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .date-chip {
    background: #232a3a;
    border: 1px solid #2a3142;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 14px;
    color: #f3f5f9;
    flex: 1;
    text-align: center;
    cursor: pointer;
  }
  .date-chip.active { border-color: rgba(78,164,255,0.4); color: #4ea4ff; }

  /* Submit button */
  .submit-btn {
    width: 100%;
    padding: 16px;
    background: #4ea4ff;
    color: #0e1116;
    font-size: 16px;
    font-weight: 700;
    border-radius: 14px;
    text-align: center;
    cursor: pointer;
    margin-top: 4px;
    letter-spacing: -0.2px;
  }

  /* State switcher (для wireframe демо) */
  .state-switcher {
    display: flex;
    gap: 4px;
    margin-bottom: 16px;
  }
  .state-btn {
    padding: 4px 8px;
    background: #232a3a;
    border-radius: 6px;
    font-size: 11px;
    color: #8e98ad;
    cursor: pointer;
  }
  .state-btn.active { background: rgba(78,164,255,0.15); color: #4ea4ff; }
</style>
</head>
<body>

<!-- Blurred background -->
<div class="bg-hint">
  <div class="bg-row"><span class="bg-label">Продукты</span><span class="bg-val">6 500 / 8 000 ₽</span></div>
  <div class="bg-row"><span class="bg-label">Кафе</span><span class="bg-val">3 200 / 5 000 ₽</span></div>
  <div class="bg-row"><span class="bg-label">Транспорт</span><span class="bg-val">2 100 / 3 500 ₽</span></div>
  <div class="bg-row"><span class="bg-label">Дом</span><span class="bg-val">800 / 4 000 ₽</span></div>
</div>

<!-- Bottom sheet -->
<div class="sheet">
  <div class="handle"></div>
  <div class="sheet-title">
    Новая трата
    <div class="close-btn">&#x2715;</div>
  </div>

  <!-- Demo state selector (wireframe only) -->
  <div class="state-switcher">
    <div class="state-btn">Пусто</div>
    <div class="state-btn">Шиммер</div>
    <div class="state-btn active">ИИ предлагает</div>
  </div>

  <!-- Kind tabs -->
  <div class="field-group">
    <div class="kind-tabs">
      <div class="kind-tab active">Расход</div>
      <div class="kind-tab">Доход</div>
    </div>
  </div>

  <!-- Amount -->
  <div class="field-group">
    <div class="field-label">Сумма</div>
    <div class="amount-row">
      <div class="amount-input">450</div>
      <div class="currency-badge">₽</div>
    </div>
  </div>

  <!-- Description -->
  <div class="field-group">
    <div class="field-label">Описание</div>
    <div class="field-input focused">кофе старбакс</div>
  </div>

  <!-- Category — STATE: AI suggestion (активное) -->
  <div class="field-group">
    <div class="field-label">Категория</div>

    <!-- State A: Normal (скрыто в этом примере) -->
    <!-- <div class="category-field">
      <span class="cat-placeholder">Выберите категорию</span>
      <span class="chevron">&#x203A;</span>
    </div> -->

    <!-- State B: Shimmer (скрыто в этом примере) -->
    <!-- <div>
      <div class="shimmer-label">
        <div class="shimmer-spinner"></div>
        ИИ определяет категорию...
      </div>
      <div class="shimmer"></div>
    </div> -->

    <!-- State C: AI suggestion (активное) -->
    <div>
      <div class="ai-suggestion">
        <div class="ai-badge">&#x1F916; ИИ</div>
        <div class="ai-suggestion-name">Кафе и рестораны</div>
        <div class="ai-change-btn">Изменить</div>
      </div>
      <div class="confidence-row">
        <div class="confidence-bar">
          <div class="confidence-fill" style="width:92%"></div>
        </div>
        <span>Уверенность 92%</span>
      </div>
    </div>
  </div>

  <!-- Date -->
  <div class="field-group">
    <div class="field-label">Дата</div>
    <div class="date-row">
      <div class="date-chip active">Сегодня</div>
      <div class="date-chip">Вчера</div>
      <div class="date-chip">5 мая</div>
    </div>
  </div>

  <!-- Submit -->
  <div class="submit-btn">Добавить</div>
</div>

</body>
</html>
```

---

## 7. Дизайн-токены для новых состояний

Расширение `frontend/src/styles/tokens.css` для v0.3 фич:

```css
/* AI-состояния */
--color-ai-primary: #6366F1;              /* indigo — AI brand color */
--color-ai-soft: rgba(99, 102, 241, 0.12); /* AI badge фон */
--color-ai-border: rgba(99, 102, 241, 0.25);
--color-ai-text: #a5b4fc;                 /* AI label цвет */

/* AI shimmer */
--shimmer-from: #232a3a;
--shimmer-to: #2a3142;
--shimmer-duration: 1.2s;

/* AI typing */
--color-typing-dot: #8e98ad;
--typing-duration: 1.2s;

/* Chart palette (6 категорий) */
--chart-1: #4ea4ff;   /* primary blue */
--chart-2: #2ecc71;   /* green */
--chart-3: #ffd166;   /* amber */
--chart-4: #ff5d5d;   /* red */
--chart-5: #a78bfa;   /* violet */
--chart-6: #34d399;   /* emerald */
--chart-plan: rgba(78, 164, 255, 0.22);   /* план: прозрачный dashed */

/* Tool-progress banner */
--color-tool-bg: rgba(78, 164, 255, 0.08);
--color-tool-border: rgba(78, 164, 255, 0.2);

/* Confidence bar */
--confidence-high: #2ecc71;    /* > 80% */
--confidence-mid: #ffb547;     /* 60-80% */
--confidence-low: #ff5d5d;     /* < 60% */

/* Admin Revoke */
--color-revoke-bg: rgba(255, 93, 93, 0.10);
--color-revoke-border: rgba(255, 93, 93, 0.25);
--color-revoke-text: #ff5d5d;
--color-revoke-confirm: #ff5d5d;  /* full destructive button */
```

**Правила применения:**

| Токен | Когда использовать |
|---|---|
| `--color-ai-primary` | AI-чат аватар, AI-badge фон/граница |
| `--color-ai-soft` | Фон chip-ов «ИИ предлагает», tool-progress banner |
| `--chart-plan` | Плановая полоска на bar chart (dashed border + прозрачный фон) |
| `--confidence-*` | Confidence-bar цвет — динамически по значению |
| `--color-revoke-*` | Только для Revoke-кнопки и confirm-sheet, нигде больше |

---

## 8. Открытые вопросы

### Навигация

1. **Аналитика — вкладка или секция?** Рекомендация: отдельная вкладка (паттерн всех конкурентов). Добавляет 5-й пункт в bottom nav: Главная / Факт / Аналитика / ИИ / Ещё. Вопрос: хватает ли по-умолчанию 5 вкладок или «Ещё» убирает 2 последних?

2. **AI-чат — вкладка или FAB?** Cleo использует FAB на главном. Наш выбор: вкладка (равноправный раздел), FAB убран — не тревожит взгляд когда чат не нужен. Если передумать — легко переключить.

3. **Период-переключатель в аналитике**: хронологический скролл или dropdown? Wireframe показывает dropdown в nav — проще реализовать, но dropdown на mobile неудобен. Альтернатива: горизонтальный скролл chips (как в Apple Wallet).

### Технические

4. **Recharts + Telegram WebView**: проверить наличие `ResizeObserver` в TG WebView Android (бывают проблемы). Fallback: задать фиксированный width вместо `<ResponsiveContainer>` если ResizeObserver отсутствует.

5. **AI suggestion debounce**: 800ms — достаточно? При быстром наборе русского текста пользователь завершает слово за 600-900ms. Рекомендую 600ms + минимальная длина 3 символа.

6. **Confidence порог**: при confidence < 60% — не показывать suggestion вообще, только selector. При 60-80% — показывать suggestion + визуальный amber-индикатор. При > 80% — suggestion как primary + зелёный confidence bar.

7. **Shimmer width**: shimmer-анимация работает только при фиксированной ширине контейнера. Убедиться что `width: 100%` применён к родителю с явным `overflow: hidden`.

8. **Admin экран**: доступен только `OWNER_TG_ID`. Нужно ли скрывать вкладку / пункт меню для обычных пользователей или показывать с locked-state? Рекомендация: полностью скрыть из nav, доступен только через прямой route или deep-link.

---

## Metadata

**Research date:** 2026-05-05
**Valid until:** 2026-08-05 (90 дней; chart library bundle sizes могут измениться)
**Depends on:** Stream B (AI architecture) — v2-stream-B-ai.md (HIGH confidence, confirmed)
**Next step:** Обсудить п.1-3 (навигация) перед началом имплементации фич
