# 05 — Caddy no-cache + Management полишинг

## Проблемы

1. **Caddy кэшировал SPA-shell.** index.html отдавался без `Cache-Control`,
   браузер использовал heuristic caching. После пересборки frontend новый
   bundle с новым хешем был в `/srv/dist/assets/`, но `index.html` в
   браузере хранился старый — со ссылкой на удалённый bundle. На каждое
   изменение требовался hard reload (Cmd+Shift+R или закрытие/открытие
   Mini App).
2. **Management screen — крупный шрифт и иконки.** Пользователь:
   «ты для слепых сделал? Нафига такой шрифт крупный?»
3. **«Сгорит N ₽»** в ForecastCard — непонятный жаргон, плюс заголовок
   «Прогноз на конец периода» неточен (там баланс, не остаток).

## Решения

### Caddy no-cache на index.html

В `Caddyfile`, `Caddyfile.cloudflare`, `Caddyfile.dev`:
```
handle {
    root * /srv/dist
    # Hashed assets are immutable — safe to cache for a year.
    header /assets/* Cache-Control "public, max-age=31536000, immutable"
    # index.html (and SPA fallback) MUST revalidate every load — otherwise
    # the browser/TG WebView keeps a stale shell that points at deleted
    # bundles after a redeploy.
    header / Cache-Control "no-cache"
    header /index.html Cache-Control "no-cache"
    try_files {path} /index.html
    file_server
}
```

`no-cache` ≠ `no-store`. Браузер кэширует, но **обязательно
revalidates** через ETag/If-None-Match. 304 Not Modified → bandwidth
почти не тратится, новые версии подтягиваются мгновенно.

**Подводный камень**: реальный смонтированный конфиг — `Caddyfile.dev`
(через `docker-compose.dev.yml`), а не `Caddyfile`. Я сначала правил
только prod-варианты, фикс не подхватывался — узнал через
`docker inspect tg-budget-planner-caddy-1 --format '{{range .Mounts}}...'`.
Поправлены **все три** файла одинаково — для согласованности при
переключении конфигов.

### Management — компактнее

`ManagementScreen.module.css`:
```diff
-.row { gap: 14px; padding: 14px 12px; }
+.row { gap: 10px; padding: 10px 12px; }
-.iconWrap { width: 44px; height: 44px; }
+.iconWrap { width: 32px; height: 32px; }
-.rowLabel { font-size: 15px; }
+.rowLabel { font-size: var(--text-sm); }   /* 13px */
-.rowDesc  { font-size: 12px; margin-top: 2px; }
+.rowDesc  { font-size: 11px; margin-top: 1px; }
-.chevron  { font-size: 20px; }
+.chevron  { font-size: 18px; }
```

`ManagementScreen.tsx`:
```diff
-<IconComp size={36} weight="thin" ... />
+<IconComp size={20} weight="regular" ... />
```

### Переименование «Сгорит»

`ForecastCard.tsx`:
- Заголовок: «Прогноз на конец периода» → «Прогноз бюджета на конец периода»
- В режиме `forecast` (1M) — раскрытая разбивка:
  ```
  Накопления (стартовый баланс)    +984 500 ₽
  План доходов                     +100 000 ₽
  План расходов                    −213 500 ₽
  ───────────────────────────────────────────
  Прогноз на конец периода         +871 000 ₽   (крупно)
  ```
- В режиме `cashflow` (3M+) — total + avg по N закрытым периодам.

«Сгорит N ₽» удалено вообще — это `will_burn_cents` от старой формулы
(`daily_rate × remaining_days`), не используется в новой схеме.

### Empty-state и empty-карточки в аналитике

`.section { background: --color-bg-elevated; border: 1px solid --color-border; border-radius: --radius-md; }` — заметная граница карточки на любом dark-фоне.

InfoNote body: вложенный блок с `--color-bg` (темнее карточки) + border —
визуально «врезанный» блок, отделён от заголовка.

## Затронутые файлы

- `Caddyfile`, `Caddyfile.cloudflare`, `Caddyfile.dev` — no-cache
- `frontend/src/screens/ManagementScreen.{tsx,module.css}` — паддинги/шрифт
- `frontend/src/components/ForecastCard.tsx` — формулировка, разбивка
- `frontend/src/screens/AnalyticsScreen.module.css` — borders для секций

## Верификация

- `curl -sI http://localhost/` → `Cache-Control: no-cache`.
- Пересборка frontend → следующее открытие приложения подтягивает свежий
  bundle (вижу новые UI-фиксы без hard reload).
- Management экран — компактнее: 4 пункта помещаются без лишнего вертикального
  пространства, шрифт читается, не «для слепых».
- ForecastCard — формула раскрыта, понятна без догадок.
