# 04 — AI чат: санитизация ошибок, lift state, dark-theme палитра

## Проблемы

1. **Raw 401 в чате.** На запрос с битым OPENAI_API_KEY пользователь
   видел `Ошибка: Error code: 401 - {'error': {'message': 'Incorrect API
   key provided: changeme...`. Утечка provider-internals в UI.
2. **История исчезает при tab-switch.** `useAiConversation()` хранит
   `messages` в local `useState`. `App.tsx` рендерит `<AiScreen />`
   только при `activeTab === 'ai'` → unmount → state потерян.
3. **Белый фон чата на dark-теме.** `var(--tg-theme-bg-color, #ffffff)` —
   fallback `#fff` срабатывал везде кроме TG WebView с выставленной
   переменной. На скрине чат был ослепительно-белым на тёмном фоне.
4. **«Дырка» в empty-state.** `margin: auto` центрирует suggestions по
   вертикали, но визуально читается как «недогруженный экран». Нужен
   паттерн ChatGPT/Claude — suggestions у поля ввода.

## Решения

### Санитизация ошибок (backend)

`app/ai/providers/openai_provider.py`:
```python
def _humanize_provider_error(exc: Exception) -> str:
    status = getattr(exc, "status_code", None)
    raw = str(exc).lower()
    if status == 401 or "401" in raw or "incorrect api key" in raw:
        return "AI не настроен на сервере (проверь OPENAI_API_KEY)."
    if status == 429 or "rate_limit" in raw:
        return "Слишком много запросов. Подожди минуту и повтори."
    if status and 500 <= status < 600:
        return "AI-провайдер временно недоступен. Попробуй позже."
    return "Не удалось получить ответ от AI. Попробуй позже."

# в except:
logger.exception("OpenAI provider error during streaming")
yield {"type": "error", "data": _humanize_provider_error(exc)}
```

`str(exc)` никогда не уходит наружу. Frontend (`useAiConversation.ts`) не
изменён — теперь приходит уже sanitized строка.

### State lift в App.tsx

```tsx
// App.tsx
const aiConversation = useAiConversation();  // hook на App-уровне
...
{!managementView && activeTab === 'ai' && <AiScreen {...aiConversation} />}
```

`AiScreen` теперь чисто презентационный — принимает `UseAiConversationResult`
через props. Hook живёт пока живёт корневой `<App>`, переживает
unmount/remount экранов.

Альтернатива (всегда mount AiScreen с display:none) отвергнута —
хук слушает SSE стримы, не хочется держать активный stream при tab-switch.

### Dark-theme палитра

Замены в `AiScreen.module.css` и `ChatMessage.module.css`:
| Было                                            | Стало                  |
|-------------------------------------------------|------------------------|
| `var(--tg-theme-bg-color, #ffffff)`             | `var(--color-bg)`      |
| `var(--tg-theme-secondary-bg-color, #f0f0f0)`   | `var(--color-surface)` |
| `var(--tg-theme-text-color, #000000)`           | `var(--color-text)`    |
| `var(--tg-theme-hint-color, #999999)`           | `var(--color-text-muted)` |
| `var(--tg-theme-button-color, #2481cc)`         | `var(--color-primary)` |

В TG-токенах есть полный набор `--color-*` для dark/light темы (через
`[data-theme="light"]` overrides). Fallback'и `#fff/#000` теперь не нужны.

### Empty-state

`.messagesEmpty { justify-content: flex-end }` — suggestions прижаты к
input bar, верхняя зона свободна (для будущих сообщений). Стандартный
паттерн ChatGPT/Claude.

Раньше: `.emptyState { margin: auto }` (gap сверху и снизу симметричный
~166px). Сейчас: gap сверху ~600px, gap снизу 0 — суммарный объём
свободного пространства тот же, но визуально читается естественнее.

## Затронутые файлы

- `app/ai/providers/openai_provider.py` — `_humanize_provider_error`,
  logging
- `frontend/src/App.tsx` — `useAiConversation` поднят, передача в `<AiScreen>`
- `frontend/src/screens/AiScreen.{tsx,module.css}` — пропсы, палитра,
  `messagesEmpty { justify-content: flex-end }`
- `frontend/src/components/ChatMessage.module.css` — палитра

## Верификация

- Битый OPENAI_API_KEY → видно «AI не настроен (проверь OPENAI_API_KEY на
  сервере).», не raw stacktrace.
- Отправить сообщение → перейти на «Транзакции» → вернуться на «AI» →
  история на месте.
- Чат тёмный (никакого `#fff` фона), бабблы user/assistant читаемы.
- Empty-state — sparkle и suggestions у поля ввода, не в центре экрана.
