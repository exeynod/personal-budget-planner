# Legal Review — Open Items

> Перед публичным launch'ом сервиса необходимо провести professional
> legal review всех документов, помеченных `Draft v0.1`. Этот файл —
> checklist для юриста и owner'а.

## Документы под ревью

| Файл | Версия | Статус |
|------|--------|--------|
| `docs/legal/privacy-policy.ru.md` | v0.1 | Draft, pending |
| `docs/legal/privacy-policy.en.md` | v0.1 | Draft, pending |
| `docs/legal/terms.ru.md` | v0.1 | Draft, pending |
| `docs/legal/terms.en.md` | v0.1 | Draft, pending |

## Чеклист ревью

### Privacy Policy

- [ ] Соответствие действующей редакции 152-ФЗ на момент launch'а
      (проверить amendments после 2026-01).
- [ ] Корректность перечня sub-processors (OpenAI — EU residency
      подтверждена?). Уточнить cross-border data transfer disclosure.
- [ ] Срок retention audit-журнала (1 год) — соответствует best practice?
      Уточнить минимум по 152-ФЗ §18.1.
- [ ] Указание ст. 14-15 (права субъекта) — корректные ссылки?
- [ ] Контакт DPO — нужен ли отдельный DPO (для физлица обычно нет,
      но юрист подтверждает).
- [ ] Cookie policy — достаточно ли info-only или нужен opt-in?
      (Зависит от наличия PostHog/Plausible на момент launch'а — Phase 38.)

### Terms of Service

- [ ] Раздел Billing — пустой placeholder, заполнится после Phase 34
      (ЮKassa). Уточнить с юристом: refund policy, recurring billing
      disclosure, дату начала действия подписки.
- [ ] Ограничение ответственности — формулировка «не более суммы
      подписки за 12 месяцев» — допустима в РФ?
- [ ] Запрещённое использование — достаточно ли purpose-limited?
- [ ] Юрисдикция (РФ) — достаточно для launch в РФ, но для EN-версии
      (международный аудитория) — uncertain. Уточнить.

### Cross-border Data Transfer

- [ ] OpenAI servers находятся в EU. Это попадает под «передача ПДн
      в иностранное государство»? Если да — нужно специальное согласие
      субъекта на трансграничную передачу (ст. 12 152-ФЗ).
- [ ] Telegram — тоже потенциально трансграничный. Проверить статус
      Telegram'а как PII processor в РФ.

### Refund / Billing (после Phase 34)

- [ ] Refund window (по умолчанию — 14 дней с даты списания для
      consumer subscriptions в РФ согласно Закону о защите прав
      потребителей).
- [ ] Auto-renewal disclosure (явное информирование за 24h до списания).
- [ ] Cancellation flow (one-click отписка — обязательное требование).
- [ ] ЮKassa чек (auto-receipt от ЮKassa Self-Employed) —
      достаточно для compliance с ФНС?

### РКН-уведомление

- [ ] Подать уведомление через `docs/legal/RKN-NOTIFICATION.md` шаблон.
- [ ] Записать reg-номер в `docs/COMPLIANCE.md`.

## Финализация

После профессионального legal review:

1. Заменить `Draft v0.1` на `v1.0 (legal-reviewed YYYY-MM-DD)` в headers
   всех 4 markdown файлов.
2. Записать имя и контакт юриста в `docs/COMPLIANCE.md` поле `legal_counsel`.
3. Удалить banner «pending legal review» из документов.
4. Закоммитить как `docs(legal): finalize v1.0 after legal review by <name>`.
