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
