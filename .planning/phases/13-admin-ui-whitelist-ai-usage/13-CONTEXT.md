# Phase 13: Admin UI — Whitelist & AI Usage - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Owner управляет whitelist'ом и видит AI-расходы по юзерам полностью через Mini App; никаких бот-команд. В табе «Управление» добавляется пункт «Доступ» (visible only для `role === 'owner'`), под которым два саб-таба: «Пользователи» (whitelist + invite + revoke) и «AI Usage» (per-user breakdown). Backend получает 3 admin-endpoint'а под `Depends(require_owner)` (уже шипнуто Phase 12), фронт читает `role` из `/me`.

Out of scope для этой фазы: реальный enforcement spending_cap (это Phase 15 с `429`), полноценный onboarding для приглашённых юзеров (это Phase 14), полноценная audit_log таблица (deferred — пока структурированный лог).

</domain>

<decisions>
## Implementation Decisions

### Layout экрана «Доступ»
- Sub-tab компонент: reuse существующий `SubTabBar` (underline sticky, как в Транзакциях/Аналитике)
- Структура строки юзера: `[icon] Имя` (или `tg_user_id` если onboarding не пройден) · `last_seen Xd назад` · `[role badge]` · `[revoke btn]` для members
- Empty list state: inline-hint «Никого не приглашено» с CTA-стрелкой к FAB (без отдельной illustration)
- Sort order: `last_seen_at desc`, owner-строка закреплена сверху как первый элемент (не сортируется)

### Invite flow
- Поля формы: только `tg_user_id` (число); имя вытянем при первом `/me` юзера после bot bind
- Валидация: числовое поле, min length 5 цифр, paste-friendly; `@username` НЕ принимаем
- Submit success: toast «Приглашение создано» + закрыть bottom-sheet + auto-refresh списка
- Дубль (member уже приглашён): API возвращает `409 invite_exists`; UI показывает inline-error в форме без закрытия sheet

### Revoke flow
- Confirm-dialog wording: «Все данные пользователя X (id…) будут безвозвратно удалены: транзакции, категории, AI-история. Продолжить?»
- Self-revoke owner: запрещено — UI скрывает кнопку для owner-строки; backend `require_owner` + явный 403 если попробовать `DELETE /api/v1/admin/users/{owner_id}`
- UX после подтверждения: optimistic — строка пропадает мгновенно; при ошибке rollback + toast
- Аудит-trail: структурированный log line `audit.user_revoked uid=… by_owner=… purged_rows=…` (ops видит в logs); полная audit_log таблица — out of scope (deferred)

### AI Usage view
- Окна времени: current month — primary card (большой блок); 30d — secondary stat (sub-text под main blocks) на строку
- Progress indicator: linear bar с цветами — pattern из `DashboardCategoryRow` (≥80% warn-стили, ≥100% danger-стили)
- spending_cap до Phase 15: Phase 13 шипит default `$5/month` (≈ 46500 копеек USD) как stub в `app_user.spending_cap_cents` (миграция добавляет колонку); реальное enforcement (`429 на /ai/chat`) → Phase 15
- Sort: по `est_cost_usd desc` (топ-расходчик сверху); fallback alphabet если все = 0

### Claude's Discretion
- Точные иконки phosphor-icons для role badge (owner / member) — выбор Claude
- Mock data в Storybook/dev — выбор Claude
- Тексты toast'ов и error messages (придерживаться существующего русского tone) — Claude
- Внутренняя структура компонентов AccessScreen / UsersList / AiUsageList / InviteSheet / RevokeConfirmDialog — Claude
- Подход к optimistic updates: useTransition vs custom queue — Claude (предпочтение: простой optimistic с локальным state + rollback)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/SubTabBar.tsx` — underline sticky sub-tabs (используется в Транзакциях, Аналитике)
- `frontend/src/components/BottomSheet.tsx` — модальный bottom-sheet для форм (Invite будет использовать)
- `frontend/src/components/Fab.tsx` — floating action button (Invite FAB)
- `frontend/src/components/PageTitle.tsx` — заголовок экрана
- `frontend/src/components/SectionCard.tsx` — карточка-контейнер для блоков
- `frontend/src/components/DashboardCategoryRow.tsx` — паттерн строки с linear progress bar (можно адаптировать для AI Usage)
- `@phosphor-icons/react` — иконки (Users, UserPlus, Trash, Crown / ShieldStar для role badge)

### Established Patterns
- CSS Modules (`*.module.css`) для каждого компонента/экрана
- Хуки данных: `frontend/src/hooks/use*.ts` (см. useMe, useTransactions и пр.) — паттерн для `useAdminUsers`, `useAdminAiUsage`
- API клиент: `frontend/src/api/` — добавим `frontend/src/api/admin.ts`
- Типы: `frontend/src/api/types.ts` — расширим `AdminUserResponse`, `AdminUserCreateRequest`, `AdminAiUsageResponse`
- Backend dep: `app/api/dependencies.py::require_owner` (Phase 12, готово); router pattern → новый `app/api/routes/admin.py` с `prefix="/admin"`
- Backend services: `app/services/` — добавим `admin_users_service.py` + `admin_ai_usage_service.py`
- Cascade purge: ON DELETE CASCADE есть на embeddings/AI; для остальных таблиц — service-layer purge (см. Plan 11-05 D-NOTE про unscoped DELETE)

### Integration Points
- `frontend/src/screens/ManagementScreen.tsx` — добавить пункт «Доступ» с conditional render по `role`
- `frontend/src/App.tsx` — добавить роут/screen state `'access'` в navigation tree (под Управление)
- `app/api/router.py` — `app.include_router(admin_router, prefix="/api/v1")` (admin_router из новой `routes/admin.py`)
- `/me` endpoint уже отдаёт `role` (Phase 12); frontend `useMe` уже типизирован
- `app_user.spending_cap_cents BIGINT NOT NULL DEFAULT 46500` — alembic 0008 миграция (для Phase 13 stub; Phase 15 enforcement)

### Sketches reference
- Sketch 010 «admin-whitelist» (`.planning/sketches/010-admin-whitelist/`) — variants A/B/C all valid; берём элементы:
  - A: список + inline-кнопки (для табельной части)
  - B: invite sheet (форма с tg_user_id)
  - C: revoke confirm с явным предупреждением

</code_context>

<specifics>
## Specific Ideas

- Confirm-dialog для revoke реализуется как `BottomSheet` с двумя кнопками («Удалить» destructive + «Отмена») — переиспользует существующий компонент, без нового modal-слоя
- Toast компонент — если ещё не существует в codebase, добавить минимальный (top-of-screen banner с auto-dismiss 3s); проверить при планировании
- AI Usage row может переиспользовать паттерн `DashboardCategoryRow` с linear bar — не дублировать стили
- Empty state «Никого не приглашено» — простой `<p className={styles.hint}>` под FAB-областью, без иллюстраций (проект минималистичный)

</specifics>

<deferred>
## Deferred Ideas

- Полноценная audit_log таблица — deferred (см. REQUIREMENTS.md «Audit log (deferred from v0.3 research)»)
- PATCH `/admin/users/{id}/cap` для редактирования spending_cap из admin UI — Phase 15 (AICAP-04)
- Имя/Заметка при invite (комментарий «кто это») — рассматривали, отвергли в пользу простоты
- Resolve `@username` через TG Bot API — отвергли (требует extra API call, не нужно в MVP)

</deferred>
