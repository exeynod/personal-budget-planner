# Compliance — State of the Union

> Top-level state-of-compliance document для сервиса TG Budget Planner.
> Updated as compliance milestones land. Audience: владелец, future legal
> counsel, Phase 37 open-core readers.

## Юрисдикция

Основная юрисдикция — Российская Федерация. Применимое право: 152-ФЗ
«О персональных данных», ГК РФ, Закон о защите прав потребителей,
Налоговый кодекс РФ (НПД для самозанятых начиная с Phase 34).

GDPR / CCPA compliance — отложено до v2.0 (EN expansion).

## РКН — Регистрация оператора ПДн

| Поле | Значение |
|------|----------|
| `rkn_registration_id` | _(заполнить после подачи через `docs/legal/RKN-NOTIFICATION.md`)_ |
| `rkn_notified_at` | _(дата получения reg-номера)_ |
| `rkn_notification_form_url` | https://pd.rkn.gov.ru/operators-registry/notification/form/ |
| `rkn_operator_lookup_url` | https://rkn.gov.ru/personal-data/register/ |

Статус: **Pending submission** (REQ-33-01, manual user-side action).

## DPO Contact

Единственный контакт по вопросам обработки ПДн:

- Email: **exeynod@gmail.com**
- Telegram: канал автора (см. конкретный URL после launch).

Для физлица отдельный DPO не назначается (согласно ст. 18.1 ч. 2 152-ФЗ
обязанность назначить DPO возникает только при наличии 100+ работников
или специальной категории ПДн — у нас не применимо).

## Sub-processors

| Sub-processor | Цель | Расположение | Risk-status |
|---------------|------|--------------|-------------|
| OpenAI Inc. | AI-чат / категоризация | EU (api.openai.com EU residency) | Трансграничная передача — требует доп. согласия (см. `LEGAL-REVIEW-TODO.md`) |
| Telegram Messenger LLP | Доставка сообщений | Variable (зависит от инфраструктуры) | Pending review |

Никаким другим третьим лицам ПДн не передаются.

## Сроки хранения данных (Retention)

| Категория | Срок | Триггер удаления |
|-----------|------|------------------|
| Активный аккаунт | Бессрочно | Запрос пользователя |
| Soft-deleted аккаунт | 30 дней | `purge_deleted_users_job` (daily 02:00 MSK) |
| Audit-журнал (`pdn_audit_log`) | 1 год после account-delete | Archival policy (v2.0) |
| Backup БД | 30 дней | Cron rotation |

## Audit log policy

Таблица `pdn_audit_log` хранит события:

- `granted` — согласие получено.
- `revoked` — согласие отозвано.
- `data_export` — пользователь запросил экспорт.
- `deletion_requested` — пользователь запросил удаление аккаунта.
- `deletion_completed` — physical hard-delete завершён.

Идентификация пользователя в audit — sha256(user_id); IP — sha256(ip_address).
Raw user_id / IP в таблице **не хранятся**.

## Compliance Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 32 | Shipped 2026-05-11 | Multi-tenant RLS production-ready |
| Phase 33 | _In progress_ | Compliance baseline (ПДн, ToS, Privacy, audit) |
| Phase 34 | Pending | ЮKassa + auto-чек compliance |
| Legal review | Pending | См. `docs/legal/LEGAL-REVIEW-TODO.md` |
| РКН submission | Pending | См. `docs/legal/RKN-NOTIFICATION.md` |

## Legal counsel

- **Юрист:** _(имя + контакт после legal review)_
- **Дата legal review:** _(заполнить после finalization)_

## Контакт для regulatory inquiries

Любые запросы от регуляторов (РКН, ФНС), судебные требования или
нотификации о data breach направляются на: **exeynod@gmail.com**.

Ответ предоставляется в сроки, установленные применимым законодательством
(ст. 14 ч. 1 152-ФЗ — 30 дней на запрос субъекта).
