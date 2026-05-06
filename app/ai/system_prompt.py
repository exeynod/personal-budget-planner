"""Системный промпт и сборщик messages для OpenAI API (AI-07).

build_messages() включает:
1. Системный промпт с cache_control (prompt caching) — роль + правила
2. История из БД (последние AI_MAX_CONTEXT_MESSAGES)
3. Новое сообщение пользователя

Промпт на русском (по решению Claude's Discretion из CONTEXT.md).
"""
from __future__ import annotations

SYSTEM_PROMPT = (
    "Ты — персональный бюджетный помощник в Telegram Mini App. "
    "Отвечаешь только на вопросы о бюджете пользователя: расходы, доходы, баланс, "
    "категории, прогнозы. Используй инструменты (functions) для получения актуальных "
    "данных из базы данных. Если данных недостаточно — скажи об этом честно. "
    "Отвечай кратко и по делу. Суммы всегда в рублях (данные хранятся в копейках — "
    "делить на 100 перед выводом). Положительная дельта означает, что бюджет в норме."
)


def build_messages(
    history: list[dict],
    user_message: str,
) -> list[dict]:
    """Собрать messages list для OpenAI API с cache_control на системном промпте.

    history: список dict {role, content} из БД (уже обрезан до 20 сообщений).
    user_message: новое сообщение пользователя.

    Возвращает список в формате OpenAI messages с structured content
    для системного промпта (prompt caching через cache_control).
    """
    messages: list[dict] = [
        {
            "role": "system",
            "content": [
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    # Сигнал для prompt caching (AI-07).
                    # OpenAI автоматически кэширует при >= 1024 токенов.
                    "cache_control": {"type": "ephemeral"},
                }
            ],
        }
    ]

    # История разговора из БД (уже отфильтрована сервисом до 20 сообщений)
    for msg in history:
        role = msg.get("role", "user")
        content = msg.get("content") or ""
        # tool messages: role="tool" -> передаём как assistant (simplification)
        if role == "tool":
            messages.append({"role": "assistant", "content": content})
        else:
            messages.append({"role": role, "content": content})

    # Новое сообщение пользователя
    messages.append({"role": "user", "content": user_message})

    return messages
