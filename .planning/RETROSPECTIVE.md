# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.3 — Analytics & AI

**Shipped:** 2026-05-06
**Phases:** 6 (4 numbered + 2 INSERTED) | **Plans:** 25 | **Commits:** 152

### What Was Built

- **Nav refactor (Phase 7):** функциональный bottom nav 5 табов (Главная / Транзакции / Аналитика / AI / Управление); History+Plan объединены в «Транзакции» с под-табами; More переименован в «Управление»; 27/27 e2e tests PASS.
- **Analytics screen (Phase 8):** 4 backend endpoints (`trend`, `top-overspend`, `top-categories`, `forecast`); самописные SVG-чарты без recharts/visx; 13 contract-тестов pass.
- **AI Assistant (Phase 9):** conversational chat с 6 tools (`query_transactions`, `get_period_balance`, `get_category_summary`, `compare_periods`, `get_subscriptions`, `get_forecast`), streaming SSE, prompt caching, persistence в `ai_conversation`/`ai_message`, провайдер-агностичный LLM-клиент.
- **AI Categorization (Phase 10):** embeddings + pgvector cosine similarity, 500ms debounce, toggle в Settings, HNSW index.
- **AI Cost Optimization (Phase 10.1, INSERTED):** ~50% input-токен reduction (English prompts), `GET /ai/usage` observability, history 20→8, embed_text LRU cache, embedding-on-create.
- **AI Hardening + Write-Flow (Phase 10.2, INSERTED):** OPENAI_API_KEY end-to-end fix (6 latent багов), AI propose-and-approve write-flow (никогда не пишет в БД молча), synonym-augmented embeddings, gpt-4.1-mini upgrade, DEV_MODE auto-seed.

### What Worked

- **Live-UAT перед closed milestone** — раскрыл 6 latent багов Phase 9/10, которых не нашли автоматизированные тесты (главный: OPENAI_API_KEY никогда не пробрасывался в api контейнер). Без этого v0.3 ушёл бы в прод сломанным.
- **Phase 10.2 как INSERTED после UAT** — vs. попытки впихнуть фиксы обратно в Phase 9/10 ретроактивно. Чистая история, отдельный SUMMARY.
- **Скетчи перед Phase 7** — 5 вариантов `007-bottom-nav` сэкономили часы дискуссий о размещении табов.
- **Provider-agnostic LLM client** с самого старта Phase 9 — позволил сменить gpt-4.1-nano → gpt-4.1-mini в Phase 10.2 одной строкой ENV без переписывания.
- **Cost audit перед Phase 10.1** — ловит ~50% input-cost до production, а не после.
- **English system prompts** — неочевидное решение, но ~2.3× token compaction окупилось мгновенно.

### What Was Inefficient

- **Phase 9 первый OpenAI-вызов в production** — раскрыл фундаментальные wiring баги, которых не было видно в pytest. Стоит rule: «integration test с реальным API key до GREEN gate».
- **Phase 10.1 и 10.2 inline (без отдельных XX-NN plan files)** — нарушает GSD-best-practice. Оправдано для small-scope INSERT-фаз, но при росте scope превращается в спагетти. Для v0.4 INSERT-фазы делать формальные планы.
- **gpt-4.1-nano стартовый выбор** — слишком слабая модель, выдумывала категории и плохо считала. Pre-flight evaluation с реальными промптами сэкономил бы Phase 10.2 hardening.
- **Confidence-bar в AICAT-02** — добавили без user-validation, потом убрали в 10.2 после UAT. Скетч уже показывал, что bar добавляет visual noise.
- **REQUIREMENTS.md не сопровождался** — все checkbox'ы остались `[ ]` несмотря на реализацию, потому что workflow не требовал отметок при phase-завершении. Создаёт ложное впечатление при close milestone.

### Patterns Established

- **AI propose-and-approve для write-операций** — AI никогда не пишет в БД молча; предлагает + открывает prefilled bottom-sheet, юзер подтверждает.
- **Synonym-augmented embedding source** — embedding text = `name + synonyms` для лучшего matching коротких русских описаний (Пятёрочка → Продукты).
- **In-process ring buffer для observability** — `GET /ai/usage` через collections.deque(maxlen=1000); per-process scope OK для single-tenant pet, promote to DB при cross-process visibility.
- **English prompts → Russian responses через explicit instruction** — token-efficient pattern для русскоязычных AI features.
- **DEV_MODE auto-seed** — `docker compose up` поднимает рабочий стек одной командой без manual onboarding (9 категорий, период, 7 sample транзакций).

### Key Lessons

1. **Live integration test с реальным API ключом обязателен до GREEN gate.** pytest mock'и не ловят wiring-баги типа «KEY никогда не пробрасывался в контейнер».
2. **Choose models on capability, not cost first.** gpt-4.1-nano был cheapest, но не справился с аналитикой → потратили Phase 10.2 на hardening + миграцию. Cost optimization должен быть post-validation, не pre-build.
3. **Cost audit перед production-релизом AI feature** — обязателен. Phase 10.1 показал, что pre-audit никто не делал, а production cost был бы в 2× выше необходимого.
4. **REQUIREMENTS.md checkbox'ы = lying truth без enforcement.** Либо автоматически отмечать при phase-completion, либо удалять из workflow.
5. **INSERT-фазы для post-UAT фиксов лучше, чем ретроактивные правки исходных фаз.** Чище git history, явный SUMMARY, не путает audit.
6. **Скетчи перед UI-фазой стоят дешевле любых правок после.** Phase 10.2 убрал confidence-bar, который скетч `011-A` уже показывал лишним.

### Cost Observations

- Model mix: подавляющая Opus 4.7 (1M context) — задачи требовали глубокого reasoning'а, особенно при debugging Phase 9/10 багов
- Sessions: ~5-7 (точное число неизвестно, последний resume — 2026-05-06)
- Notable: Phase 10.2 single-session всю работу за день (2026-05-06) — context maintenance окупает себя на больших фазах

---

## Milestone: v0.6 — iOS App + wise-tide UI/UX refactor

**Shipped:** 2026-05-09
**Phases:** 5 (Phase 17-21) + 13-commit wise-tide refactor | **Branch:** `v0.6-ios-app`

### What Was Built

- **iOS-foundation (Phase 17):** SwiftUI-проект `/ios/` через XcodeGen, `APIClient` URLSession+Codable+ISO-8601, `AuthStore` + `KeychainStore` с UserDefaults fallback (unsigned simulator-сборки), backend `POST /auth/dev-exchange` (Alembic 0011 + Bearer-fallback в `get_current_user` без поломки web).
- **iOS Core CRUD (Phase 18):** `period_for` port на `Calendar(timeZone: Europe/Moscow)`, `MoneyParser` digit-walk без Float, Home + Transactions + Categories + Settings.
- **iOS Management (Phase 19):** Subscriptions с UNCalendarNotificationTrigger reschedule-on-create, Template apply, Analytics через native Swift Charts.
- **iOS AI (Phase 20):** `SSEClient` через `URLSession.bytes(for:)` + `AsyncStream<SSEEvent>`, AIChatView со streaming + AIProposalSheet write-flow.
- **TestFlight (Phase 21, partial):** Privacy manifest + AppIcon. **Free Apple ID install работает на iPhone Denis.** Apple Developer Program + TestFlight отложены — внешний gating $99/год.
- **wise-tide refactor (2026-05-09):** UI/UX полная переработка. Изначальный pixel-perfect web port под TG Mini App стиль (peach `#F6EFE6` cream + 6-layer `LiquidGlass` UIViewRepresentable + custom BottomBar+FAB + hardcoded `.system(size:)`) был оценен пользователем как «детская игрушка». Переделано под Apple iOS 26 native: `.glassEffect()` API, `TabView { Tab() }.tabBarMinimizeBehavior(.onScrollDown)`, semantic typography, `.systemGroupedBackground` фон, `Form/List(.insetGrouped)` везде, native `Stepper`/`Toggle`/`DatePicker`/`Picker(.segmented)`, ContentUnavailableView. Все 12 экранов прошли rewrite. ~−500 LOC net.

### What Worked

- **Foundation phase + per-screen migrations** разбивка для wise-tide refactor — Phase F переделал общий design layer и shell с compat shim'ами (Tokens.Ink → .primary, AdaptiveBackground → systemBg, и т.д.) чтобы экраны компилировались до Phase S. Каждый screen-rewrite атомарный commit. Cleanup-commit в конце убрал shim'ы. Чистая incremental migration без всё-сломанного периода.
- **DEV-флаги через UserDefaults** (`DEV_OPEN_TX_SHEET`, `DEV_OPEN_MANAGEMENT_SCREEN=<id>`, `DEV_FORCE_ONBOARDING`) — программная навигация в любой sub-screen без manual taps. Окупились 10× за wise-tide pass — снимать screenshots каждого экрана через `xcrun simctl io booted screenshot` без UI automation.
- **iPhone 17 Pro Sim + iOS 26.4 + Xcode 26.4.1** — позволили использовать iOS 26 native APIs (`.glassEffect()`, `.tabBarMinimizeBehavior`) сразу, без conditional `if #available(iOS 26, *)` ветвлений. Bumped deployment target 17→26 — bold но оправданно для pet с известными устройствами owner'а.
- **Read+Edit+Bash+screenshot loop через Read** — каждый screenshot после rebuild ревьюился inline через Read tool (multimodal Claude видит изображение). Без него pixel-perfect refactor вслепую невозможен. Workflow: edit → make build → install → screenshot → Read → diff vs reference.
- **Compat shim как migration pattern** — Phase F создал `Backgrounds.swift` с `AdaptiveBackground` / `LiquidGlass` / etc обёртками поверх native materials. Экраны продолжали компилироваться с старым кодом, переписывались по очереди в Phase S, в конце shim удалён. Альтернатива (всё переписать одним коммитом) оставляла бы проект в broken state на часы.

### What Was Inefficient

- **Pixel-perfect web port → wise-tide rewrite** — 2 прохода вместо одного. Изначально портировали 1:1 web стилистику (peach aurora, 6-layer fake glass, custom FAB) — pet user смотрел и сказал «детская игрушка, не iOS». Если бы UI/UX research (Apple HIG + Wallet/Stocks reference) был сделан **до** Phase 17, оба прохода схлопнулись бы в один. Lesson: для cross-platform port не делать assumed pixel-perfect — спросить про aesthetic direction до старта.
- **REQUIREMENTS.md checkbox'ы остались [ ]** на момент close (та же проблема что и v0.3) — workflow всё ещё не требует отметки при phase-completion. Помечал retroactively через sed при close. Решение: hook в `/gsd-execute-phase` который при completion автоматически отмечает REQ-IDs phase'а.
- **Phase 17-21 не имели formal SUMMARY.md** — реальная работа делалась через Quick `/gsd-quick` и direct edits, без `/gsd-execute-phase` workflow. `roadmap.analyze` показал 0% completion при close. Workflow assumes formal phase execution; при ad-hoc работе artifacts не накапливаются.
- **TestFlight setup не был стартовым** — Phase 21 стоял последним, но требует $99 + 24-48h Apple ID review. Если бы началось параллельно с Phase 17 — Phase 21 мог бы закрыться когда iOS UI готов. Сейчас free Apple ID install работает (7-day cycle), но TestFlight отложен до отдельной сессии.
- **cliclick / AppleScript automation для UI testing — слабая ссылка.** Координаты для tap'а через `xcrun simctl io booted screenshot` приходится вычислять manually (window coords + 3x scale ratio). XcodeBuildMCP / idb-companion были бы proper решением, но не surfaced в сессии. Решение для будущего: установить XcodeBuildMCP заранее, использовать `tap`/`typeText`/`describeUI` вместо координатной арифметики.

### Patterns Established

- **iOS 26 native «branded native» pattern** — Apple HIG-compliant chrome (`Form/List(.insetGrouped)`, `.glassEffect()`, semantic typography, `.systemGroupedBackground`) + один brand accent через `.tint(Tokens.Accent.primary)`. Аналог Robinhood — orange identity без custom palette.
- **Foundation-then-screens migration для cross-platform UI rewrites** — общий design layer + compat shim, потом per-screen, потом cleanup. Атомарные commits, never-broken state.
- **DEV-флаги через UserDefaults для UI debugging** на симуляторе — `xcrun simctl spawn booted defaults write` устанавливает state до launch, app читает в `.task`/`.onAppear`. Позволяет screenshot любого экрана / sheet'а без manual navigation.
- **Glass policy: только на nav chrome, не на content** — Apple iOS 26 Liquid Glass design contract. `.glassEffect()` на TabBar/Toolbar/Sheet headers (система делает сама). На контенте экранов — `.regularMaterial` через native Form/List backgrounds. Исправляет «glass на всём» антипаттерн web-port.

### Key Lessons

1. **Перед cross-platform UI port — research target platform's HIG.** Web → iOS не работает 1:1 даже визуально. Apple HIG patterns (List(.insetGrouped), Form { Section }, semantic typography, .systemGroupedBackground) фундаментально отличаются от web Material/Tailwind/custom. Pixel-perfect web на iOS = «детская игрушка».
2. **iOS 26 native APIs (`.glassEffect()`, `.tabBarMinimizeBehavior`) лучше чем custom obs-emulation.** Custom `LiquidGlass` UIViewRepresentable с 6 layers (blur + tint + plusLighter + 2 strokes + 2 shadows) визуально хуже чем single `.glassEffect()`. Bump deployment target 17→26 для pet с известными устройствами — оправдано.
3. **Apple semantic typography (.body, .caption, .largeTitle) — не optional.** Hardcoded `.system(size: X)` ломает Dynamic Type, не адаптируется в dark mode (через `.foregroundStyle(.primary)`/.secondary), и накапливает magic numbers. Перевод на semantic за wise-tide refactor — net-positive с первого экрана.
4. **REQ-ID checkbox enforcement в workflow** — обязателен. После 4 milestones одна и та же проблема: REQUIREMENTS.md `[ ]` на момент close, помечается retroactively. Нужен hook в phase-completion.
5. **Aesthetic direction discovery — separate phase до start кодинга.** «Apple-native vs branded vs dark-first» решение должно быть локализовано в research-phase до Phase 1, а не выявляться через user feedback после готового pixel-perfect port. AskUserQuestion-через-skill вначале сэкономит N сессий.

### Cost Observations

- Model: Opus 4.7 (1M context) — единственная модель сессии, ~25 commits за один длинный workflow. Длинный context (3 раунда — Phase 17-21 + wise-tide F+S1-S11+cleanup + final audit) — окупается на pixel-perfect refactor где каждый screenshot Read поддерживает understanding общего state'а.
- Sessions: 1 marathon-сессия (2026-05-09, ~3 рабочих часа в Claude Code).
- Notable: wise-tide refactor — 13 атомарных commits за один pass, без compile errors между ними благодаря compat shim'ам в Phase F. Net delta −500 LOC = удалили больше чем добавили.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v0.2 | 6 | 38 | Initial workflow setup; sketches → research → roadmap → execute |
| v0.3 | 6 (2 INSERTED) | 25 | INSERTED-фазы как ответ на post-UAT findings; pre-execution cost audit |

### Cumulative Quality

| Milestone | Tests | TS Errors | Vite Build |
|-----------|-------|-----------|-----------|
| v0.2 | — | 0 | ✓ |
| v0.3 | 245+ pytest, 27 e2e | 0 | ✓ (335 kB JS, 64 kB CSS, 532ms) |

### Top Lessons (Verified Across Milestones)

1. **Live UAT перед close обязателен** — раскрывает то, что pytest пропускает.
2. **Provider/dependency abstraction окупается при первой смене.**
3. **REQUIREMENTS.md как источник правды требует автоматизации, иначе врёт.**
