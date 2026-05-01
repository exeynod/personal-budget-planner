# Sketch Plan

Цель: покрыть UI-эскизами все ключевые экраны MVP из BRD §5 (UC-1…UC-10).
Каждый скетч = один экран с 2-3 вариантами. Останавливаемся только на
checkpoint выбора winner. Mood/feel зафиксирован в MANIFEST.md (banking-premium dark).

## Roadmap

| #   | Sketch                  | Покрывает UC      | Статус | Winner |
|-----|-------------------------|-------------------|--------|--------|
| 001 | dashboard-summary       | UC-1              | ✅ done | B      |
| 002 | add-transaction         | UC-2              | ✅ done | B      |
| 003 | dashboard-states        | UC-1 (edge-cases) | ✅ done | all 4  |
| 004 | subscriptions           | UC-7, UC-8        | ✅ done | A      |
| 005 | plan-and-categories     | UC-4, UC-5, UC-6  | ✅ done | B      |
| 006 | onboarding              | UC-10             | ✅ done | B      |

Settings (cycle_start_day, notify_days) и закрытие периода (UC-9)
покрываются простыми формами / диалогами — отдельных скетчей не делаем,
паттерны переиспользуются из 005 и 006.

Bot UX (UC-3) визуально тривиален (плоские текстовые сообщения + inline-кнопки),
sketch не требуется. Оставляем как ASCII-черновик в HLD §5.

## Правила прохода

- 2-3 варианта на скетч (минимум один — «путь наименьшего сопротивления» под React+TG SDK).
- Все варианты следуют design direction из MANIFEST.md (тёмная тема, hero-карточки,
  tabular-числа, зелёный/красный для дельты).
- Checkpoint = выбор winner (A/B/C/синтез). Без выбора winner следующий скетч не начинается.
- После winner → README frontmatter, MainFEST update, ★ маркер на winning tab.
