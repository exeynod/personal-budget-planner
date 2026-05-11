# ЮKassa Onboarding — Самозанятый Edition

## Цель
Подключить приём платежей через ЮKassa для self-employed (НПД, 4-6% налог).

## Pre-requisites
- ИНН (если нет — получить через ФНС).
- Telegram-аккаунт + банковская карта или счёт (для верификации).
- Установленное приложение «Мой Налог» (ФНС, App Store / Google Play).

## Шаги

### 1. Регистрация как самозанятый (один раз)
1. Открой «Мой Налог», авторизуйся через Госуслуги или ИНН+пароль ФНС.
2. Подтверди статус самозанятого (если ещё не активен).
3. Запиши свой ИНН.

### 2. Регистрация в ЮKassa
1. Перейди на https://yookassa.ru → «Подключиться» → выбери «Самозанятый».
2. Заполни анкету:
   - ИНН
   - Паспортные данные
   - Реквизиты карты для выплат
   - Контактные данные
3. ЮKassa проверит ИНН через ФНС автоматически (1-2 рабочих дня).
4. После одобрения — в личном кабинете ЮKassa получи:
   - `shop_id` (например `123456`)
   - `secret_key` (production, например `live_AB...`)
   - Test credentials: `test_AB...`

### 3. Настройка проекта
1. Скопируй credentials в `.env`:
   ```
   YOOKASSA_SHOP_ID=123456
   YOOKASSA_SECRET_KEY=live_AB...
   ```
   (для dev/staging — `test_AB...`).
2. Настрой webhook URL в личном кабинете ЮKassa:
   - Production: `https://api.tgbudget.app/webhooks/yookassa`
   - Указать события: `payment.succeeded`, `payment.canceled`, `refund.succeeded`.
3. (Опционально) IP-allowlist webhook IPs ЮKassa в Caddy/firewall: `185.71.76.0/27`, `185.71.77.0/27`, `77.75.153.0/25`, `77.75.156.11`, `77.75.156.35` (актуальный список — в [ЮKassa docs](https://yookassa.ru/developers/using-api/webhooks)).

### 4. Тест в sandbox
```bash
curl -X POST http://localhost:8000/api/v1/billing/create-payment \
  -H "Content-Type: application/json" \
  -H "X-Test-User: <your_tg_id>" \
  -d '{"amount_cents": 29900, "return_url": "https://tgbudget.app/return"}'
```
Должен вернуть `{ "payment_id": N, "confirmation_url": "https://yookassa.ru/checkout/..." }`. Открой confirmation_url, оплати тестовой картой `1111 1111 1111 1026`, заверши `3DS-check` любым кодом.

### 5. Проверка webhook
Эмулируй webhook вручную:
```bash
curl -X POST http://localhost:8000/webhooks/yookassa \
  -H "Content-Type: application/json" \
  -d '{"event": "payment.succeeded", "object": {"id": "pmt_test_123"}}'
```
В БД должна появиться `subscription_billing.status = 'active'` с `tier = 'pro'` на 30 дней.

## Налоговая отчётность
- ЮKassa Self-Employed автоматически передаёт чеки в «Мой Налог» (НПД).
- Налог 4% (с физических лиц) или 6% (с юр.лиц) считается ФНС автоматически.
- Раз в месяц проверяй «Мой Налог» — корректные чеки за прошлый месяц.

## Известные ограничения
- Лимит дохода самозанятого — 2.4M ₽ / год. При превышении — обязательная регистрация ИП.
- Платежи только в RUB.
- Refund — через личный кабинет ЮKassa (self-service в приложении пока нет — `v1.2 backlog`).
