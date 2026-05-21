> **HUMAN-UAT ACCEPTED by owner (exeynod) — 2026-05-21.** Live-smoke принят владельцем без отдельного прогона; функционал верифицирован в коде/тестах/на симуляторе (phase 71). Статус: accepted.

---
status: partial
phase: 63-subscriptions-v06
source: [63-VERIFICATION.md]
started: 2026-05-20
updated: 2026-05-20
---

## Current Test

[awaiting human testing — live backend + simulator/device]

## Tests

### 1. post (провести списание)
expected: Управление → Подписки → swipe строки → «Провести» → confirmationDialog → реальная транзакция-списание создаётся на сервере; после reload появляется posted-бейдж (checkmark.circle.fill).
result: [pending]

### 2. unpost (отменить проведение)
expected: swipe проведённой подписки → «Отменить проведение» → confirmationDialog → транзакция удаляется; бейдж исчезает после reload.
result: [pending]

### 3. create monthly с счётом + днём (create + PATCH)
expected: «+» → editor → name + сумма + cycle=monthly + day_of_month (Stepper) + счёт (Picker) → «Создать» → legacy create + follow-up V10 PATCH; на success подписка с днём+счётом; при сбое PATCH — sheet НЕ закрывается, баннер «Подписка создана, но счёт/день не сохранились…» (WR-02).
result: [pending]

### 4. edit legacy monthly без day_of_month
expected: открыть существующую monthly подписку без day_of_month → «Сохранить» НЕ трогая Stepper → день месяца НЕ записывается в 1 (WR-03). Зависит от данных backend.
result: [pending]

### 5. notification fire-date восточнее МСК (WR-05)
expected: на устройстве в TZ восточнее Europe/Moscow уведомление о подписке срабатывает в правильный календарный день (без off-by-one); decode yyyy-MM-dd согласован с МСК.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
