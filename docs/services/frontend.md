# frontend

React 18 + Vite + TypeScript Mini App (SPA). Единственный дизайн — Liquid Glass
(native iOS). Собирается в статику, отдаётся Caddy. Сборка — init-контейнер.

## Назначение

Telegram Mini App: дашборд план/факт, ввод трат (bottom-sheet), план месяца и
шаблон, подписки, аналитика, AI-чат, онбординг, настройки. Авторизация —
TG `initData` в заголовке (в `DEV_MODE` бэкенд игнорирует содержимое).

## Стек

- React 18, Vite, TypeScript
- `@telegram-apps/sdk-react` (init + safe-area + viewport)
- CSS-модули + токены `--lgn-*` в `stylesV10/native.css`
- vitest (unit), Playwright (e2e)

## Точка входа

`src/main.tsx`: `init()` TG SDK (best-effort, толерантно вне Telegram) →
`expandWebApp()` + `setupSafeArea()` → выставляет
`<html data-theme="liquid_glass">` до первого рендера → лениво импортирует
`./AppV10` → рендерит `<AppV10/>`. `AppV10` → `NativeShell` (единственный shell;
Maximal Poster выпилен из веба, dispatch'а тем больше нет).

## Как раскатать

**Локально (dev):**

```bash
cd frontend
npm install
npm run dev        # vite на :5173, proxy /api → http://localhost:8000
```

Нужен поднятый api на :8000 (`docker compose ... up -d db api`). В `DEV_MODE`
бэкенд авто-логинит owner — отдельный auth на фронте не нужен.

**Production:** SPA собирается через `deploy/Dockerfile.frontend` (stage `exporter`)
init-контейнером `frontend` — кладёт `dist/` в named volume `frontend_dist`,
который Caddy монтирует read-only в `/srv/dist`. Деплой — push в `master` → CI.

## Структура каталога

```
frontend/src/
├── main.tsx                 # bootstrap: TG SDK + theme + lazy AppV10
├── AppV10.tsx               # корневой компонент → NativeShell
├── stylesV10/
│   ├── native.css           # токены --lgn-* (Liquid Glass)
│   ├── responsive.css       # адаптив
│   └── animations.css
├── screensV10/
│   ├── native/              # NativeShell + примитивы (Button, Calendar,
│   │                        #   DatePicker, PeriodSwitcher, Toast, AddSheet…)
│   ├── common/              # общие компоненты экранов
│   └── <feature>/           # Home/Plan/Transactions/Subscriptions/Analytics/
│                            #   Ai/Auth/Onboarding/CategoryDetail/AddSheet/Management
├── api/
│   ├── v10/                 # типизированные клиенты (home, periods, planMonth,
│   │                        #   planTemplate, planned, actual, balance,
│   │                        #   subscriptions, categories, accounts, analytics, ai)
│   ├── client.ts            # базовый fetch + initData header
│   ├── cache.ts             # клиентский кэш
│   └── generated/           # openapi-typescript из contract/openapi.json
└── utils/                   # safeArea и пр.
```

Экраны-фичи обычно разбиты на `Mount` (данные/состояние) + `NativeView`
(презентация). Генерация типов API: `npm run gen:api`
(`openapi-typescript ../contract/openapi.json -o src/api/generated/schema.ts`).

## Тесты

```bash
cd frontend
npm test            # vitest (unit: client/cache/ai и др.)
npm run test:e2e    # Playwright: tests/e2e/native-liquid-glass.spec.ts +
                    #   responsive.spec.ts
```

## Подводные камни

- **Деньги — копейки.** Бэкенд отдаёт `*_cents` (BIGINT); на UI делим на 100 и
  показываем рубли. Никаких float-расчётов в копейках.
- **iOS backdrop-filter.** Liquid Glass использует `-webkit-backdrop-filter`
  (префикс обязателен для Safari/TG WebView на iOS), иначе стекло не блюрит.
- **Один дизайн.** Тема жёстко `liquid_glass`; постер-дизайн удалён — не
  возвращать dispatch тем.
- **Safe-area / viewport.** `.appRoot` использует `max(env(), var(--tg-safe-*))`,
  чтобы корректно работать и в обычном браузере, и в TG fullscreen (где
  `env()=0`, а инсеты приходят от TG).
- **initData.** В проде заголовок валидируется бэкендом (HMAC); фронт лишь
  пробрасывает `window.Telegram.WebApp.initData`.

**Держать актуальным:** при изменении поведения этого сервиса обнови этот файл в том же коммите (см. docs-drift правило в CLAUDE.md).
