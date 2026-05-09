---
phase: 19
status: human_needed
date: 2026-05-09
---

# Phase 19 Verification: iOS Management

## Code Status — все компилируется

**BUILD SUCCEEDED** на iPhone 17 Pro Simulator со всеми новыми файлами:
- `Networking/DTO/ManagementDTO.swift` (Subscription, TemplateItem, TopCategoryRow, ForecastResponse, TrendResponse)
- `Networking/Endpoints/ManagementAPI.swift` (SubscriptionsAPI, TemplateAPI, AnalyticsAPI)
- `Domain/LocalNotifications.swift` (UNUserNotificationCenter wrapper, requestAuthorization, reschedule)
- `Features/Management/SubscriptionsView.swift` (List + FAB + SubscriptionEditor with cycle/date/notify_days)
- `Features/Management/TemplateView.swift` (List + apply-template button)
- `Features/Management/AnalyticsView.swift` (Picker range + ForecastCard + Swift Charts: trend LineMark + top BarMark)
- `ManagementView.swift` обновлён — все sub-screens подключены (Categories, Subscriptions, Template, Analytics, Settings)

## Refresh без регрессии

Home продолжает работать после Phase 19 changes. POST /auth/dev-exchange + GET /me + /periods/current + /balance — все 200.

## Acceptance per REQ

| REQ | Status |
|---|---|
| IOS-15 (Subscriptions + LocalNotifications) | ✓ code, ⏳ manual UAT |
| IOS-16 (Template apply + Analytics Charts) | ✓ code, ⏳ manual UAT |

## Human UAT Required

1. **Меню → Подписки:** список подписок отсортирован по next_charge_date. FAB → SubscriptionEditor (название, сумма, цикл monthly/yearly, дата след. списания, категория, notify_days_before, isActive toggle). Save → запись на бэке + локальная нотификация запланирована.
2. **При первом открытии Subscriptions:** запрашивается permission на нотификации.
3. **Локальная нотификация:** для подписки с next_charge_date=завтра + notify_days_before=1 → нотификация показывается завтра в 09:00 МСК.
4. **Меню → Шаблон плана:** список items + кнопка "Применить к текущему периоду" → POST /periods/{id}/apply-template → результат "Создано N, пропущено M".
5. **Меню → Аналитика:** Picker 1М/3М/6М/12М. ForecastCard (расход на конец, баланс на конец, run_rate, days_remaining). Trend LineChart (факт vs план). Top categories BarChart по цветам.
