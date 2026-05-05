---
sketch: 011
name: ai-categorization
question: "Как показать AI-предложение категории в bottom-sheet?"
winner: null
tags: [ai, categorization, form, bottom-sheet]
---

# Sketch 011: AI Categorization

## Design Question
Как AI-предложение категории интегрируется в форму добавления транзакции?

## How to View
open .planning/sketches/011-ai-categorization/index.html

## Variants
- **A: Авто-выбор** — AI сразу подставляет категорию, можно сменить. Кнопки демо-состояний (loading/suggestion/empty)
- **B: Explicit chip** — поле категории + отдельный AI-chip под ним «нажми чтобы применить»
- **C: Inline banner** — AI-уведомление над кнопкой submit

## What to Look For
- Вариант A vs B: авто-подстановка или явное подтверждение?
- Confidence bar (91%) — нужен пользователю или лишний шум?
- Не мешает ли AI-элемент основному flow добавления?
