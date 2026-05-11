---
title: PRODUCT-STRATEGY — TG Budget Planner v1.1
created: 2026-05-11
status: decided
research_round: v1.1
depends_on: [v1.1-SYNTHESIS.md, v1.1-monetization-research.md, v1.1-persona-jtbd.md, v1.1-pricing-monetization.md, v1.1-distribution-200usd.md, v1.1-competitors-intl.md]
---

# TG Budget Planner — Product Strategy v1.1

## Executive Summary

- **Покупатель:** русскоязычный самозанятый/микро-ИП-фрилансер 22–40 лет в IT/дизайне/маркетинге, активный TG-пользователь (Persona E из R2) — primary, 60% усилий. Secondary — РФ cash-heavy юзер (Persona C, 30%). Эмигранты-релоканты (Persona D) — spillover 10%, без целевых инвестиций.
- **Модель монетизации:** **2-tier freemium (Q1=b)** через **ЮKassa + статус «самозанятый» (Q2=b)**, TG Stars как secondary rail для TG-нативного сегмента. Цены: Free (до 30 tx/мес, 5 категорий, manual entry) / **Pro 299 ₽/мес или 1990 ₽/год** (AI conversational + бизнес/личное теги + резерв на налог + CSV-export + push). Один платный tier с AI inside, не отдельный «AI Premium» — solo-dev capacity и trust-anchor «ниже Дзен-мани 269 ₽» важнее теоретической WTP-сегментации.
- **Open-source split:** **Open-core (Q3=c)** — CLI + docker-compose ядро (схема, period engine, бот-команды) под PolyForm Shield; hosted версия с AI, iOS-клиентом, Maximal Poster и multi-tenant cloud — closed.
- **iOS roadmap:** **Defer до v1.2 (Q4=b)** — Apple Dev $99/yr не оплачивается, TestFlight private/100-invite остаётся как есть, v1.0.1 baseline (358 XCTest зелёных) замораживается в bugfix-only режиме.
- **2 защищаемых moat'а:** (1) TG-нативная distribution (бот + Mini App; никто из 28 intl-конкурентов не в TG [S1 §1]); (2) Conversational AI с tool-use + propose-and-approve (никто из intl-18 не делает agentic AI с записью в БД [R1 §Незакрытые gap'ы]).
- **Kill-metric:** **к концу месяца 6 после публичного launch'a v1.1 — 8 платящих пользователей со сроком жизни ≥30 дней.** Меньше — публичный продукт закрывается, возврат в personal-tool / portfolio-piece. Это нижняя граница R3 M2 «realistic» (15K ₽ MRR) с 50%-дисконтом на отсутствие brand recognition [R3 §Главный pricing-риск].
- **Investment frame:** pet + portfolio piece + side-income. **НЕ замена зарплате** (реалистично ~1/15 от dev-медианы РФ), **НЕ стартап-чейзинг** [S1 §Истина #3]. Этот фрейм определяет каждое последующее решение.

---

## 1. Target Customer

**Primary (60% усилий): Persona E — самозанятые/микро-ИП в РФ.** ФНС 2024 = 12.2M зарегистрированных, активная подгруппа 2–3M, наш фокус «фрилансер-айтишник/дизайнер/маркетолог в TG» — 300–500K. WTP при позиционировании «учёт доходов и расходов + резерв на налог + P&L» = **499–1500 ₽/мес** [R2 Persona E §5]. Контур.Эльба для УСН-ИП = 1700–3000 ₽/мес — валидированный business-tier anchor в РФ.

**Secondary (30%): Persona C — РФ cash-heavy middle-class** (25–40, доход 50–200K ₽/мес, 70/30 безнал/нал). WTP 199–499 ₽/мес. Каналы acquisition перекрываются с Persona E на 60% — Habr, vc.ru, T-Ж, TG-каналы про финансы/фриланс. JTBD пересекается на cash-категоризации и быстром вводе — один продукт обслуживает оба без раздвоения.

**Spillover (10%): Persona D — эмигранты-релоканты.** WTP $7–15/мес, но без multi-currency мы для них downgrade против Spendee $22.99/yr [R2 Persona D §8]. Получают продукт «бесплатно» через TG-канал автора, целевых инвестиций нет.

**Кого НЕ обслуживаем (forced choice [S1 §Истина #1]):**
- **Persona A (YNAB-tribe US):** уже платят $109/yr с full Plaid; «за $5–7/мес TG-приложение не заплатят» [R2 Persona A §5].
- **Persona B (Gen-Z Cleo):** требует TikTok-машины, FTC-settlement Cleo делает категорию рискованной [R1 §Cleo AI].
- **Persona F (FIRE):** wants investment tracking + net worth — другой продукт.

**Главный трейдофф признан явно:** Persona A/B/D хотят bank-sync через Plaid, Persona C/E **любят** ручной ввод (для них это фича, не баг) [R2 §Cross-Persona]. Один продукт оба полюса обслужить не может. Выбираем сторону «manual entry с AI-категоризатором». **Без Plaid intl до 2027 закрыт** [S1 §Истина #1].

## 2. Monetization Decision

### 2.1 Pricing tier — Q1=b (2-tier Free / Pro 299 ₽)

**Выбрано:** Free — план/факт, 30 tx/мес, 5 категорий, бот-команды, manual entry. **Pro 299 ₽/мес или 1990 ₽/год** (16.7% annual discount [R3 §F]) — unlimited tx + категории, AI conversational chat, AI auto-cat, multi-period, бизнес/личное теги, резерв на налог 4–6%, CSV export, push, iOS (когда вернётся в v1.2+).

**Rationale:**
1. **Solo-dev capacity vs 3-tier UX-сложность.** R3 M2 явно: «3 tier'a = UX-сложность solo-разработчику» — три tier'a требуют feature-matrix, две точки апселла, две воронки analytics. 20 ч/нед не покрывают.
2. **Anchor 299 ₽ против Дзен-мани 269 ₽.** Позиция «чуть дороже Дзен-мани, но с AI conversational». 599 ₽ из M2 R3 опирается на CoinKeeper Platinum 125 ₽ как anchor, но Platinum продаёт «AI-кнопки», не chat. User не знает разницу до апгрейда — лучше один tier с AI «зашитой».
3. **WTP Persona E 499–1500 ₽ сохраняется опцией для v1.2.** Если в Q1 явный pull на «бизнес-фичи + AI» = WTP signal — добавим Business 999 ₽ tier поверх Pro в v1.2. Forward-compatible, не закрывает M2 R3, но не рискует усложнением в v1.1.
4. **Realistic 6-мес MRR ≈ 5–10K ₽** (между R3 M2 realistic 15K и M1 Stars-only 3K, скорректировано на 50% no-brand discount [R3 §Главный риск]). Покрывает run-rate $15/мес и buffer — единственная честная цифра для pet-frame.

**Отвергается:**
- **Q1=a (TG Stars only 199 ₽):** LTV 1200 < CAC 1500 [R3 M1], rail режет ~30%, серая зона вывода через TON, Apple ToS запрещает external promo при App Store.
- **Q1=c (3-tier 0/299/599):** solo-dev overhead, риск каннибализации Pro→AI Premium. Отложено как опция v1.2 при явном WTP signal.

### 2.2 Payment rail — Q2=b (ЮKassa + самозанятый primary; TG Stars secondary)

**Выбрано:** **ЮKassa с самозанятого** primary recurring-rail (СБП 0.4% + карта 3.5% + НПД 6% + чек «Мой Налог» через 24h — total ≈10% take, маржа 270/299 ₽ in-pocket). **TG Stars** secondary для non-RU TG-юзеров (эмигранты, intl Telegram-сегмент) — там ~30% take, zero setup, приемлемо для marginal channel.

**Rationale:**
1. **Юридически работающий путь.** ЮKassa с самозанятого — единственный RU-rail без обязательной ИП-регистрации, легально recurring + чеки «Мой Налог». Регистрация в «Мой Налог» = 1 день, налог 4%/6%, никакой отчётности кроме автоматических чеков [R3 §D; R0 §7.4]. Без этого нет публичного launch'a (152-ФЗ требует РКН-уведомления + действующего юр.лица для приёма платежей).
2. **Margin 85%+ на 299 ₽ tier.** 299 × 0.9 ≈ 270 ₽ in-pocket; OpenAI cost при active Pro user ≈ 30–50 ₽/мес [R3 M2 §4]. Чистая маржа ≈ 220 ₽/мес × 30 paying = ~6.6K ₽/мес после API-cost.
3. **TG Stars не primary потому что rail-cut уничтожает margin** (199 ₽ → 130 ₽ in-pocket через Fragment+IAP+НПД). Stars OK как marginal channel для аудитории без ЮMoney/СБП.
4. **«Hybrid», но не M5 parallel.** В paywall две кнопки: ЮKassa primary, TG Stars secondary, для одного SKU. Это **не M5 RU+intl** (тот требует 2× compliance, GDPR+152-ФЗ, risk 5/5). Compliance footprint минимальный.

**Required setup:**
1. Самозанятый в «Мой Налог» (1 день).
2. ЮKassa merchant для самозанятых (2–3 дня verification).
3. Recurring + webhook integration (3–5 дней dev).
4. Чек-generation через ЮKassa API (auto-receipt ≤24h после платежа).
5. РКН-уведомление (1 день онлайн).
6. ToS + Privacy Policy + ПДн-consent в /start (2–3 дня legal copy).
7. TG Stars payment provider в @BotFather (1 час).

**Отвергается:**
- **Q2=a (TG Stars only):** rail-cut + Apple ToS блокеры, сужает до TG-only без RU recurring.
- **Q2=c (parallel hybrid с Boosty):** Boosty 13% не даёт преимущества над ЮKassa для subscription. Усложнение без выигрыша.
- **Q2=d (open-source + Boosty donations only):** MRR 3.5K [R3 M3] ниже kill-metric. Donation-модель работает как top-of-funnel (см. Q3), не primary.

### 2.3 Open-source split — Q3=c (Open-core)

**Выбрано:** open-core под **PolyForm Shield 1.0.0**. В public GitHub:
- Схема БД (Alembic migrations).
- Period engine (`period_for`, `close_period_job`).
- Бот-команды `/add`, `/income`, `/balance`, `/today`.
- Docker-compose self-host setup.
- CLI для CSV import/export.

**Closed-source (driver монетизации):**
- AI conversational client + propose-and-approve UX + prompt caching.
- Maximal Poster design system.
- iOS-приложение (когда вернётся).
- Multi-tenant cloud (RLS, AccessScreen, role-based deps).
- Embeddings-based auto-categorization + embedding cache (это IP).

**Rationale:**
1. **Habr/Show HN amplifier.** R4 ранжирует Habr longread #1 (ROI/час, CPI <$2) и Show HN #2 — оба работают только при actual GitHub-репо приложить. Open-core ядро = discovery-engine, превращающий R4-content в conversion [S1 §Opportunity #2].
2. **Trust-anchor против Cleo FTC-window.** Cleo $17M FTC settlement март 2025 + 2.9★ Nov 2025 — категория получила trust-trauma. Open-source ядро + self-host capability = самый дешёвый способ показать «мы не Cleo, не Дзен-мани, у нас нет dark patterns» [S1 §Opportunity #1].
3. **PolyForm Shield не GPL и не Apache.** Запрещает «compete-against-hosted» использование, разрешает self-host, fork для contributions, academic. Сохраняет B2B/white-label опцию M6 для v2.0. Apache/MIT отдаёт moat без gain [R4 §F1 reject]; GPL делает proprietary AI-client невозможным.
4. **Self-host audience ≠ paid-hosted audience.** R3 M3 §Risks: «self-host audience = разработчики, не overlap с budgeting end-users». Tech-savvy юзер с docker-compose ≠ Persona E фрилансер. Open-core не каннибализирует Pro.

**Отвергается:**
- **Q3=a (closed-source):** теряем R4 #1+#2 каналы и anti-Cleo brand-axis.
- **Q3=b (open-source ВСЁ + платный hosted):** Firefly III модель — $200–800/мес donations [R3 §G], недостаточно для kill-metric. Plus отдаём AI-moat (6–12-мес окно) бесплатно.
- **Q3=d (отдельные модули OSS, продукт closed):** теряем main acquisition benefit (Show HN attribution идёт на полный self-host, не на «отдельные библиотеки»).

### 2.4 iOS roadmap — Q4=b (Defer до v1.2)

**Выбрано:** **iOS заморожена в v1.0.1 baseline.** Apple Dev $99/yr не оплачивается, TestFlight private/100-invite через Free Provisioning. Bugfix-only режим, никаких новых фич. Возврат iOS в активный roadmap — ТОЛЬКО при MRR ≥5K ₽ к месяцу 6.

**Rationale:**
1. **Persona E — Android-heavy.** R2 §Recommended Segment: «iOS-only premium — Persona E android-heavy, явный no-go». iOS-сегмент среди самозанятых — мини-фракция.
2. **iOS-design проигрывает Copilot.** S1 §1 #5: «HANDICAP против Copilot $13/мес, iOS-design эталон категории». Догнать Copilot — другой продукт и другой market.
3. **Apple App Store не работает для РФ payments** [S1 §T5]. Apple Pay не работает для РФ-карт. Distribution channel для primary persona фактически отсутствует.
4. **$99/yr окупится 1.5–2 года при kill-metric MRR.** «Apple Dev в минимальном сценарии не платится» [R0 §6.1] — записано в NOT-Doing list.

**Отвергается:**
- **Q4=a (continue polish):** DIVERGENCES I-06..I-08 [v1.0.1 audit] — 2–3 недели dev без monetization signal.
- **Q4=c (drop iOS целиком):** жёстче чем нужно. Кодовая база shipped и рабочая, заморозка с trigger для разморозки лучше полного отказа.

## 3. Defensible Moats

Из 7 shipped дифференциаторов после S1 анализа осталось 2 реальных moat'а с 80% защитной ценности портфеля. Остальные 5 — commodity, handicap или dev-time-sink [S1 §1 итоговая таблица].

### Moat 1: TG-нативная distribution

**Кейс защиты.** Никто из 28 intl-конкурентов R1 не в Telegram. Monarch $850M val, Copilot iOS-эталон, Cleo $280M ARR — все идут через Plaid + web/iOS. TG-bot + Mini App как первичный entry-point — white-space с 6–12-мес окном до того, как Monarch/Copilot решат добавить TG (для них не приоритет — Plaid-monopoly как distribution-engine) [S1 §1; R1 Matrix].

**Что строить чтобы не потерять окно:**
1. **Бот-команды как primary input UX, не fallback.** `/add 500 такси`, `/balance`, `/today` — функции, которых нет в App Store-продуктах. v1.1 добавляет `/tax` (резерв на налог самозанятого), `/csv` (экспорт периода в личку), `/p` (мгновенный план/факт).
2. **Mini App как обогащённая bottom-sheet поверх бота.** 5-табовая навигация → переработать в «Mini App = aналитика + AI + управление», бот = ввод. Вычистит дублирование.
3. **TG-канал автора (build-in-public)** [R4 §A4] — 3 поста/нед, ретеншн-механизм + owned audience.
4. **Cross-promo с TG-каналами самозанятых** [R4 §A3] — 4–6 партнёрств за 90 дней, нулевой денежный effort. «Самозанятый.PRO», «Финансы фрилансера» 5–30K подписчиков охотно берут гостевые материалы [R2 Persona E §6].

**6–12-мес окно:** Realistic — никто из intl не придёт в TG в 2026–2027. Когда придут (2027+), у нас должна быть накопленная база TG-юзеров с network effects (общие default-категории, ru-language embedding cache). Если придут раньше — kill-metric сработает первым и мы будем в close-mode.

### Moat 2: Conversational AI с tool-use + propose-and-approve

**Кейс защиты.** R1 §Незакрытые gap'ы: «Никто не делает agentic AI с tool-use — только Q&A над данными». Monarch AI Assistant — Q&A. Cleo — chat без tool-use. Copilot — tooltips. Origin — SEC-advisor. Наш AI с 6 tools + propose-and-approve (AI никогда не пишет в БД молча) — самая защищённая фича в портфеле на 6–12 мес [S1 §1 #2].

**Что строить чтобы углубить moat:**
1. **Расширить до 12–15 tools** в v1.1: `record_tax_reserve`, `tag_business_vs_personal`, `forecast_period_end`, `propose_subscription` (распознавание recurring из частоты), `export_csv`, `schedule_action`.
2. **Scheduled actions через worker.** Сейчас AI работает только sync в conversation. Worker добавляет «AI proposes завтра в 09:00 — резерв 4% от вчерашнего дохода клиента». Это agentic в полноценном смысле.
3. **Embedding cache как IP-актив** [R0 §4.4]. Накопленные ru-embeddings — накопительный moat. MVP-кэш пустой; каждый период использования наполняет. **НЕ выкладывать в open-source** — этот компонент остаётся closed.
4. **AI как центр UX, не «tab №4»** [R0 §4.1]. В v1.1 на Home переехать AI-блок над dashboard tabs (1 chip-вопрос + CTA «Спросить AI»). Обучить юзера на agentic-flow в первый день, чтобы Cleo казалось «не agentic».

**Угроза копирования:** Cleo/Monarch могут добавить tool-use за 2 спринта [R0 §4.1]. За 6–12-мес окно нужно (a) накопить embedding-cache до объёма, нереплицируемого <3 мес; (b) встроить scheduled-actions так, чтобы требовалось переписать LLM-orchestration; (c) встроить AI в onboarding Persona E.

## 4. Geography Rollout

- **v1.1 (мес 1–3): РФ-only.** Русский UI, ЮKassa + TG Stars, ФЗ-152 baseline. Target — 50 регистраций, 5 paying-trial, 2 paying-30d.
- **v1.2 (мес 4–6): English MVP — TG-сегмент русскоязычной диаспоры.** EN UI через i18n toggle (не отдельное приложение). TG Stars only intl. Без multi-currency — только RUB display + manual «эквивалент» для USD/EUR-транзакций. Target — 200 регистраций cumulative, 15 paying-trial, 8 paying-30d.
- **v2.0 (мес 7–12): Full EN + multi-currency + App Store** — ТОЛЬКО при passed Month-6 gate. Apple Dev оплачивается, регистрируется юр.лицо (Estonia e-Residency или KZ LLC), Stripe-account открывается. **3-условное решение, не план**.

## 5. Payment Rail Matrix

| Geo | Persona | Primary rail | Take | Setup | Status v1.1 |
|-----|---------|--------------|------|-------|-------------|
| РФ | E, C | ЮKassa (СБП+карта) | ~10% | Самозанятый + ЮKassa merchant | **Active** |
| TG-intl | D | TG Stars | ~30% | TG payment provider @BotFather | **Active (secondary)** |
| Intl Web/iOS | A/B | Stripe + App Store SBP | 2.9%+30¢ / 15% | Не-РФ юр.лицо | **Deferred v2.0** |
| OS self-host | All | Boosty / GH Sponsors | 13% / 0%+2.9% | — | **NOT v1.1** (§2.3) |

## 6. Distribution Plan @ $200/мес

Бюджет $200 × 6 = ~108K ₽. Per R4 ranked shortlist.

### Мес 1–3 (v1.1 launch, ~$600 total)

**Каналы (organic-only, нулевой paid finance ads [R4 §A1, §D2]):**
1. **Habr longread #1** — angle «Архитектура AI-бюджет-приложения с propose-and-approve и open-core ядром». Embed GitHub. Раздел «Финансы в IT». Best-case 5–25 paying [R4 §C1].
2. **ProductHunt + Show HN combo (week 4–6).** PH launch ($40 PRO для hunter outreach). Show HN неделей позже — angle «privacy-first, AI-categorization runs on device». R4 #2/#3, reusable social proof.
3. **TG cross-promo (free)** — 4–6 партнёрств с «Самозанятый.PRO», «Финансы фрилансера», «ФНС: самозанятость» за 90 дней.
4. **Own TG-канал build-in-public** — 3 поста/нед [R4 §A4].
5. **ASO RU baseline** — landing page, OG-card, 60-sec demo video.

**Budget breakdown:** $50 (домен + ASO + video soft) + $40 (PH PRO) + $30 (test placement в микро-канале 1–3K) + $480 buffer (video production / Habr editor / точечные TG-каналы).

**KPI Month 3:** 50 регистраций / 5 paying-trial / **2 paying-30d (mini-gate)**.

### Мес 4–6 (v1.2, ~$600 total)

1. **Habr longread #2** — angle «Что произошло за 90 дней: метрики, отказы, surprises» (build-in-public retrospective).
2. **vc.ru founder-diary** — complementary к Habr [R4 §C2].
3. **Reddit AMA r/personalfinance / r/ynab** после EN MVP. Single attempt [R4 §B1].
4. **TG-каналы paid placement** — 2 эксперимента по $80–100 [R4 §A2].

**Budget breakdown:** $200 (paid TG × 2) + $100 (Habr editor) + $300 buffer.

**KPI Month 6:** 200 регистраций cumulative / 15 paying-trial / **8 paying-30d (kill-metric main gate)**.

## 7. Success Metrics & Decision Gates

### 6-мес targets (R3 M2 realistic минус 50% no-brand discount)

- MAU: 150–250
- Paying-trial: 12–18
- **Paying-30d: 8 (kill-metric)**
- MRR: 3.5–8K ₽
- Trial→paid conversion: 1.5–2% [R3 §Главный риск]
- 3-mo retention: ≥40%
- AI usage: ≥50% paying юзеров используют AI ≥1 раз/нед

### Decision gates

**Month 3 (mini-check, end v1.1):**
- **<2 paying-30d ИЛИ <30 регистраций** → **stop**, статус «pet, не выйдет в монетизацию», возврат в personal-tool. v1.2 не делается.
- 2–4 paying-30d → continue v1.2, watch.
- ≥5 paying-30d → double-down, EN MVP перенесён на неделю 16.

**Month 6 (main kill-metric, end v1.2):**
- **<8 paying-30d ИЛИ <3K ₽ MRR** → **close to public**, обратно в personal-tool / portfolio piece. Маркетинг останавливается. Open-core ядро остаётся на GitHub архивно. Это **honest failure**, не «надо ещё подождать».
- 8–14 paying-30d / 3–8K ₽ MRR → continue v2.0 carefully, БЕЗ Apple Dev / без юр.лица.
- ≥15 paying-30d / 10K+ ₽ MRR → invest harder: Apple Dev, ИП на УСН (НПД лимит 2.4M ₽/год), Estonia e-Residency.

**Month 12:**
- **<30 paying-30d ИЛИ <15K ₽ MRR** → side-income, maintenance-mode, только bugfix.
- ≥30 paying-30d / 15K+ MRR → serious investment (legal entity, paid ad до $500/мес, possibly Plaid).

## 8. Investment Frame

- **Time:** ~20 ч/нед dev + Claude pair. НЕ full-time — вечер + weekend.
- **Money:** $200/мес marketing + $15/мес hosting/AI + $0 Apple Dev + $0 legal (самозанятый free) = **$215/мес ≈ 20K ₽/мес OPEX**.
- **Mental:** pet/portfolio + side-income. НЕ замена зарплате (медиана dev РФ ~150K ₽/мес — наш realistic MRR в 20× ниже). НЕ стартап-чейзинг. Это **runway-without-funding + portfolio piece для job-market + чувство что продукт живой** [R0 §Заключение; S1 §Истина #3].

## 9. What We're NOT Doing

- **НЕ строим Plaid integration** — стирает differentiation [S1 §Истина #1].
- **НЕ покупаем Apple Dev $99/yr** до MRR ≥5K ₽ [§2.4].
- **НЕ платим paid finance ads** — ASA CPI $8.23, TG Ads min €500 + ФАС, negative ROI [R4 §A1, §D2].
- **НЕ делаем full EN UI** пока РФ traction не виден [§4].
- **НЕ растим pricing выше 599 ₽** на 12-мес horizon (anchor — ChatGPT Plus через прокси 2200 ₽; наш Pro = «дешевле лидера и AI included»).
- **НЕ строим affiliate/banking partnerships** — Mint pivot применим только при >100K MAU [R3 §H].
- **НЕ делаем Maximal Poster conventional theme в v1.1** [S1 §Истина #2: portfolio piece, не PMF-driver]. DEBT-08 Home color picker даёт 4 swatches — достаточно.
- **НЕ закрываем DIVERGENCES.md WARNING/INFO** (15 items [v1.0.1 audit]) — sunk cost для monetization.
- **НЕ делаем multi-currency** до v2.0.
- **НЕ строим shared family budget / couples mode** — Persona E индивидуальный сегмент.
- **НЕ делаем web вне TG Mini App** — distribution moat это Telegram.
- **НЕ выкладываем embedding-cache в OSS** — AI moat остаётся в closed [§3 Moat 2].

## 10. Roadmap Input to Phase 3

### v1.1 — Monetization Foundation (мес 1–3)
- **Multi-tenant production enablement.** RLS, role-based deps, AccessScreen shipped в v0.4 — активировать на live data: backfill OWNER_TG_ID → owner role, invite flow для первых 5 paying.
- **Payment rail integration.** ЮKassa самозанятый + TG Stars. Recurring + webhook + auto-чек в «Мой Налог» ≤24h.
- **Paywall + tier enforcement.** 30 tx/мес + 5 категорий + no-AI hard limit для Free; PaywallSheet с двумя rail-кнопками; reverse trial 14-дневный full Pro (no-CC) на onboarding.
- **152-ФЗ compliance baseline.** РКН-уведомление, согласие на ПДн в /start, ToS + Privacy Policy в Mini App settings.
- **Landing page + ASO/SEO для РФ.**
- **Persona E feature pack минимальный.** Тег business/personal на категории, резерв на налог 4% (auto-deduct от income с business-тегом), CSV export endpoint.

### v1.2 — Acquisition & Retention (мес 4–6)
- Habr/Reddit traction tests (#2 + Reddit AMA).
- Onboarding optimization (analytics-driven из v1.1).
- EN MVP — i18n toggle, EN strings в onboarding/paywall/AI prompts. Без multi-currency.
- AI tool expansion — 4–6 новых tools [§3 Moat 2].
- Persona E feature expansion ТОЛЬКО при Month-3 signal pull от самозанятых.
- Referral mechanics (если bandwidth позволяет): 1-мес free Pro за приглашённого друга с активированным trial.

### v2.0 — Scale or Stop (мес 7–12)
Зависит от Month-6 gate.
- **Сценарий A (≥15 paying / 10K+ MRR):** Apple Dev, ИП-регистрация, Estonia e-Residency, Stripe-rail, App Store launch.
- **Сценарий B (8–14 paying):** maintenance-mode + ещё один Habr-experiment.
- **Сценарий C (<8 paying):** close to public, repo архивируется.

## 11. Open Questions for Phase 3

1. **Какой порядок и нумерация phases в v1.1?** Counter после v1.0.1 — Phase 31. Какие phases (32–37) покрывают: самозанятый+ЮKassa setup, paywall+tier-enforcement, 152-ФЗ compliance, Persona E feature pack, landing+ASO, onboarding-analytics?
2. **Tier-feature mapping detailed.** Какие фичи разлочиваются Free→Pro по REQ-IDs? AI conversational chat — Pro-only? AI auto-cat — только trigger или результат тоже? Push — базовая или Pro? Бот-команды свыше /add — где граница? Feature-matrix должна попасть в REQUIREMENTS.md v1.1.
3. **ProductHunt-launch artifact.** Demo-видео 60–90 sec достаточно или нужен interactive web demo (заблюренный иконками-юзерами)? Кто целевой PH-hunter outreach?
4. **Migrations для multi-tenant production enable.** Уже shipped в v0.4 (Phase 11–15), но активация требует: backfill owner-role, invite-flow tested, AI cost cap default activation. Какие Alembic-migrations писать, какие — runtime backfill?
5. **Что считать «paying user» для kill-metric?** Single successful transaction = paying-trial. **paying-30d = выживший после 30-дневного active subscription** (минимум 2 успешных billing-cycle webhook'a). Это явно в analytics dashboard и Month-6 gate audit-checklist.

---

*Strategy v1.1 commit-ready. Каждое из 4 решений (Q1=b, Q2=b, Q3=c, Q4=b) — concrete commitment + rationale + reject-list. Kill-metric: 8 paying-30d к месяцу 6, явно не диапазон. Pet-not-business frame признан вверху и определяет каждое последующее решение.*
