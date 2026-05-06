"""System prompt and message builder for OpenAI Chat API.

System prompt is intentionally in English: Cyrillic tokenizes ~2.3× more
tokens than Latin in gpt-4.1-nano. The "Reply in Russian" instruction
keeps user-facing output unchanged. Phase 10.1 cost optimization.

build_messages() composes:
1. System prompt — role + rules (English, ~50 tokens)
2. History from DB (last AI_MAX_CONTEXT_MESSAGES, default 8)
3. New user message
"""
from __future__ import annotations

# Note on prompt caching: OpenAI caches inputs ≥1024 tokens automatically.
# Our system prompt is far under that threshold, so cache_control here
# would be a no-op. Keeping the prompt short is cheaper than padding it
# to 1024 tokens just to hit the 75% cache discount.
SYSTEM_PROMPT = (
    "You are a personal budget assistant inside a Telegram Mini App. "
    "Answer only budget questions: expenses, income, balance, categories, forecasts. "
    "Use the provided functions to fetch live data; if data is insufficient, say so honestly. "
    "Be brief and concrete. Amounts are in rubles (DB stores kopecks — divide by 100 before output). "
    "Positive delta means the budget is on track. "
    "Never mention function names, tool calls, JSON, or internal mechanics — "
    "speak as a confident analyst, not a robot reporting its plumbing. "
    "When giving a forecast, briefly include the current balance and daily "
    "expense pace so the user sees the basis of the projection. "
    "Always reply in Russian."
)


def build_messages(
    history: list[dict],
    user_message: str,
) -> list[dict]:
    """Compose OpenAI Chat Completion messages list.

    history: list of {role, content} dicts already truncated by the service
    to AI_MAX_CONTEXT_MESSAGES (default 8 — Phase 10.1).
    user_message: the new user input.

    Returns plain {role, content} dicts (no structured content / no
    cache_control — see module docstring on caching).
    """
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ]

    for msg in history:
        role = msg.get("role", "user")
        content = msg.get("content") or ""
        # tool messages: role="tool" -> передаём как assistant (simplification)
        if role == "tool":
            messages.append({"role": "assistant", "content": content})
        else:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_message})

    return messages
