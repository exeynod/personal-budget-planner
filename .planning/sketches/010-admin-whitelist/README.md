---
sketch: 010
name: admin-whitelist
question: "Как управлять whitelist-пользователями?"
winner: null
tags: [admin, users, whitelist]
---

# Sketch 010: Admin Whitelist

## Design Question
Какой паттерн управления пользователями понятен и не страшен при destructive-действиях?

## How to View
open .planning/sketches/010-admin-whitelist/index.html

## Variants
- **A: Список + inline кнопки** — рабочий список, интерактивные sheet'ы invite и revoke
- **B: Invite sheet открыт** — состояние добавления пользователя
- **C: Revoke confirm** — destructive-подтверждение с двухшаговой логикой

## What to Look For
- Достаточно ли понятно предупреждение в revoke?
- Нужен ли комментарий при invite (кто это)?
- Видны ли stats (3 / 2 активных / 1 владелец)?
