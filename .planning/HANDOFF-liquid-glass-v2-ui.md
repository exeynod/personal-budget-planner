# HANDOFF — Вторая версия UI «Liquid Glass» (native iOS дизайн на iOS + web)

**Дата:** 2026-06-06 · **Ветка:** `v1.0-maximal-poster` (= master, всё запушено и задеплоено) · **Для:** новая сессия.

---

## 0. TL;DR — что делаем

В приложении должно быть **ДВА параллельных дизайна** с тумблером в настройках:

1. **Maximal Poster** — текущий дефолтный (коралл, Archivo Black, VOL.NN, острые углы). Остаётся как есть.
2. **Liquid Glass** — отдельный **native-iOS дизайн** (светлый, SF Pro, `List(.insetGrouped)`, SF Symbols, сегмент-контролы, нативный таб-бар). **НЕ перекраска постера.**

**Решения владельца (зафиксированы):**

- Название второго дизайна = **«Liquid Glass»** (именно этот native-дизайн; старое «liquid_glass» = фейк, убрать).
- **Фейковую тему `liquid_glass` (CSS-перекраска постера) — УДАЛИТЬ и заменить** настоящим native-дизайном (и на web, и на iOS).
- Web-порт — **весь набор экранов сразу** (не MVP).
- Порядок — **iOS и web параллельно** (разные агенты), бэкенд общий.
- Сосуществование — **тумблер в настройках** (Maximal Poster ↔ Liquid Glass).

---

## 1. КОНТЕКСТ: как мы сюда пришли (чтобы не повторить ошибку)

Прошлые сессии трактовали «Liquid Glass» как **CSS-тему поверх постерных экранов** (`[data-theme=liquid_glass]` в `frontend/src/stylesV10/liquid-glass.css`). Это фундаментальная ошибка: тема-оверлей на постерном DOM **никогда** не станет отдельным дизайном — получается «постер, перекрашенный в серое» (владелец прислал скрин, сказал «это не оно»).

Настоящий «Liquid Glass» = **отдельный native-iOS дизайн** со своей вёрсткой/компонентами. Он реально существует в коде (см. §2).

---

## 2. ГДЕ НАСТОЯЩИЙ ДИЗАЙН (источник правды)

### iOS — УЖЕ СУЩЕСТВУЕТ на текущей ветке ✅ (работа МАЛЕНЬКАЯ)

- `ios/BudgetPlanner/Features/` — native-экраны (Home, Transactions, Management, AI, Accounts, Savings, PlanEditor, Onboarding, Common). Это `MainShell()`.
- `ios/BudgetPlanner/App/AppRouter.swift` — уже dual-shell: `ui.theme == "v06"` → `MainShell()` (native); иначе → `V10MainShell()` (Maximal Poster).
- Собирается под текущий v1.0 API (`make build` → Build Succeeded в этой сессии).
- **Проблема:** native-дизайн спрятан под raw-строкой `"v06"` («СТАРЫЙ IOS»), а `Theme` enum (`FeaturesV10/Common/PosterTokens.swift`) имеет только `maximalPoster` + `liquidGlass` (фейк-перекраска). Нужно: сделать native MainShell первоклассной опцией `Theme.liquidGlass`, убрать фейковую liquid_glass-перекраску, починить лейбл в Settings/ThemePicker.

### Web — НЕ СУЩЕСТВУЕТ (работа БОЛЬШАЯ — главный объём)

- На web только Maximal Poster (`frontend/src/screensV10/`) + фейковая тема `liquid_glass` (CSS).
- Native-дизайна на web **никогда не было**. Нужен **полный порт** iOS native-дизайна на React как отдельный набор экранов (новый shell), переключаемый тумблером.

### Архивная ветка с оригиналом

- `git branch v0.6-ios-app` — исходный native iOS (HEAD `626e374`). Из него собирали скрины (§3). На текущей ветке Features/ — его потомок под v1.0.

---

## 3. СКРИНШОТЫ (открыть и смотреть)

**Native iOS дизайн (живой симулятор, v0.6-ios-app):**
`/Users/exy/pet_projects/tg-budget-planner/.planning/ios-native-screens/`

- `00-onboarding.jpg`, `01-home.jpg`, `02-transactions.jpg`, `03-management.jpg`
- Открыть: `! open .planning/ios-native-screens`

**Эталон Home (что должно получиться):** светлый фон, заголовок «Главная» (SF Pro), карточка «Остаток на счёте», строка ПЛАН/ФАКТ/В ЗАПАСЕ, сегмент Расходы/Доходы, insetGrouped список категорий с SF Symbols, нативный таб-бар (Главная/Транзакции/AI/Управление) + круглый «+».

**НЕ ПУТАТЬ — фейковый liquid_glass (так быть НЕ должно):**
`/Users/exy/pet_projects/tg-budget-planner/.planning/ux-refactor-screenshots/liquid_glass/` (это постер в сером — удаляем).

**Старый web v06 glass (НЕ тот дизайн, для истории):**
`/Users/exy/pet_projects/tg-budget-planner/.planning/v06-liquid-glass-screens/`

---

## 4. ПЛАН РАБОТ

### Трек A — iOS (малый): сделать native «Liquid Glass» первоклассной темой

1. `Theme` enum (`FeaturesV10/Common/PosterTokens.swift`): оставить `maximalPoster` + `liquidGlass`, но `liquidGlass` теперь означает **native MainShell**, а не перекраску.
2. `AppRouter.swift`: `Theme.liquidGlass` (или сохранённое `"v06"` мигрировать) → `MainShell()`; `maximalPoster` → `V10MainShell()`. Убрать спец-кейс `"v06"`/«СТАРЫЙ IOS».
3. Убрать фейковую liquid_glass-перекраску, добавленную в этой сессии (P4): `ThemedBackground`/`Plate` glass-gating, если оно конфликтует. ThemePicker (`FeaturesV10/Management/ThemePickerSheet.swift`) → 2 опции: Maximal Poster / Liquid Glass.
4. Проверить native MainShell против v1.0 API (онбординг/период/auth) — починить дрейф если есть (см. §5).
5. Скриншоты текущего MainShell в симуляторе (подтвердить, что = эталон из §3).

### Трек B — web (большой): порт native-дизайна на React

1. Новый shell-набор `frontend/src/screensNative/` (или аналог): Home, Transactions, AddSheet, CategoryDetail, Plan, Savings, AI, Management (+ Settings, Subscriptions, Analytics, Access, Categories, Template), Onboarding. Вёрстка = native iOS (см. скрины §3): светлый фон, крупные заголовки, скруглённые сгруппированные карточки, сегмент-контролы, нативный таб-бар.
2. Дизайн-токены native-темы: системно-серый фон (#F2F2F7), белые карточки 14-16px радиус, SF Pro / -apple-system, iOS-синий акцент, hairlines, тени. Перенести из iOS `Design/Tokens.swift` + `Design/Glass.swift`.
3. Тумблер shell в настройках: переиспользовать существующий механизм. **Убрать фейковую тему** `frontend/src/stylesV10/liquid-glass.css` + её ink-токены + ThemePicker-опцию; 2-я опция тумблера = новый native shell (а не data-theme).
   - Текущий выбор темы: `frontend/src/screensV10/common/useTheme.ts` (`ui.theme` ∈ maximal_poster|liquid_glass). Решить: shell-переключатель (как был `ui.shell`, ныне удалён) ИЛИ оставить `ui.theme`, но `liquid_glass` рендерит другой shell, а не data-theme. Скорее всего вернуть shell-диспетчер в `main.tsx`/`AppV10`.
4. Переиспользовать ВСЮ data-логику v10 (она дизайн-агностична): `api/*`, `api/cache.ts`, `api/home.ts`, `SelectedPeriodProvider`, `useResource`, `AuthGate`, `computeHomeData` и т.д. Менять только презентационный слой.
5. Полный набор экранов сразу (решение владельца).

### Трек C — бэкенд (общий, минимальный)

- API уже покрывает потребности (`/api/v1/home` bootstrap, periods, actual, categories, balance, savings, analytics, subscriptions, ai). Новых эндпоинтов, скорее всего, не нужно.
- Если native-онбординг на web будет отдельным — переиспользовать `onboarding_v10` контракт (см. §5 — там грабли).

---

## 5. ГРАБЛИ / API-нюансы (проверено в этой сессии)

- **Онбординг-контракт:** `POST /api/v1/onboarding/complete` принимает `{income_cents, accounts:[{bank,kind,balance_cents,primary}], category_plans:{code:cents}}`, `extra=forbid`. **`pdn_consent` НЕЛЬЗЯ** в этом body — сначала отдельный `POST /api/v1/me/consent`, потом онбординг. (Старый v0.6-код слал pdn_consent внутри → 422.)
- **actual create:** требует `category_id` (НЕ `category_query` на REST v10) и `tx_date` (`YYYY-MM-DD`). `kind` ∈ expense|income.
- **dev-автологин (для симулятора/скринов):** локальный dev-бэкенд (`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db api`, публикует :8000) принимает `POST /api/v1/auth/dev-exchange {"secret":"test-secret-for-curl"}` → Bearer token. Прод (`exypersonal.ru`) dev-exchange ОТКЛЮЧЁН (503) — там только реальный TG initData.
- **Period:** период переключается, прошлый период берёт данные из `getPeriodBalance(periodId).by_category`; добавление факта в прошлый период бэкенд поддерживает (auto-create closed period по `tx_date`).
- **Money:** BIGINT копейки везде; на UI рубли. Канонический форматтер на web — `screensV10/common/format.ts`.

---

## 6. ТЕКУЩЕЕ СОСТОЯНИЕ ПРОЕКТА (всё в проде)

- Прод: `https://exypersonal.ru` (Cloudflare Tunnel → Caddy → api). Живой: `/healthz` 200.
- **Деплой авто:** push в `master` → CI (GitHub Actions: backend pytest + frontend-build + frontend-e2e) → при зелёном CI авто-Deploy на VPS через Tailscale+SSH. SSH с моей стороны не нужен. См. `memory/deploy-pipeline.md`.
- Репозиторий: `exeynod/personal-budget-planner` (имя ≠ tg-budget-planner). `gh` залогинен (scope repo) — мониторить: `gh run watch <id> --exit-status`, логи `gh run view <id> --log-failed`, артефакты `gh run download <id> -n playwright-report`.
- Тесты сейчас зелёные: backend pytest ~783, web vitest ~793, e2e (v10) зелёный, **MP pixel 8/8 (Maximal Poster байт-идентичен — не сломать!)**.
- v06 web-shell УДАЛЁН (~19K LOC, коммит 2adcedb) — на web остался только v10 (поэтому native web = порт с нуля, не восстановление).
- Архитектура web v10: см. `memory/web-v10-architecture.md`. Грабли e2e/pixel: `memory/ci-e2e-gotchas.md`.

---

## 7. КОНТРАКТ / CI ГРАБЛИ (важно для зелёного CI)

- **Контракт-guard:** при изменении API регенерить `make contract && (cd frontend && npm run gen:api) && python3 contract/gen_swift_dto.py`; должно быть идемпотентно (md5 x2 одинаковы) + `python3 contract/check_dto_mirrors.py` OK. Коммитить регенерённые artefacts.
- **Linux pixel-эталоны:** Playwright pixel-снапшоты имеют `*-chromium-mobile-linux.png`; при изменении вёрстки CI краснеет → забрать свежие из артефакта упавшего рана (`*-actual.png` → переименовать в `<screen>-chromium-mobile-linux.png`), закоммитить. Локально (macOS) сверяются с `*-darwin.png`.
- **format-хук:** глобальный prettier-хук переписывает в двойные кавычки; есть `frontend/.prettierrc.json {singleQuote:true}` — не удалять.
- **Maximal Poster нельзя регрессить** — pixel 8/8 должны остаться зелёными.

---

## 8. КАК ЗАПУСТИТЬ NATIVE iOS В СИМУЛЯТОРЕ (для проверки/скринов)

```bash
# dev backend (publishes :8000, dev-exchange enabled, seeded)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --no-build db api
# iOS: текущая ветка, project в ios/ ; через XcodeBuildMCP
cd ios && xcodegen generate
# scheme env BACKEND_URL=http://localhost:8000, DEV_AUTH_SECRET=test-secret-for-curl
# build_run_sim (iPhone 17 Pro), затем ui.theme="v06" → MainShell (native)
# onboard dev-юзера через API если нужен Home с данными (см. §5)
```

(Worktree `/tmp/v06-ios` с веткой v0.6-ios-app — можно удалить: `git worktree remove /tmp/v06-ios`.)

---

## 9. ПЕРВЫЕ ШАГИ В НОВОЙ СЕССИИ

1. Прочитать этот файл + `memory/web-v10-architecture.md` + `memory/ci-e2e-gotchas.md` + `memory/deploy-pipeline.md`.
2. Посмотреть `.planning/ios-native-screens/` (эталон).
3. **iOS (трек A):** скриншот текущего `MainShell` (ui.theme="v06") в симуляторе → подтвердить = эталон → перевесить как `Theme.liquidGlass`, убрать фейк, ThemePicker 2 опции.
4. **web (трек B):** мультиагентный план порта native-дизайна на React (новый shell), удалить фейковую CSS-тему, вернуть shell-тумблер, переиспользовать data-слой v10.
5. Тесты (vitest/e2e/pixel/pytest) зелёные → push master → авто-Deploy → подтвердить прод.

## 10. ОТКРЫТЫЕ ХВОСТЫ (не блокеры этой задачи)

- Живой smoke в реальном Telegram (backend ни разу не щупали в боевом TG WebView).
- Бэкапы БД отсутствуют (риск, владелец в курсе).
