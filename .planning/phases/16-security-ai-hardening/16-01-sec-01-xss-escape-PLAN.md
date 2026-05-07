---
plan_id: 16-01-sec-01-xss-escape
phase: 16
plan: 01
type: execute
wave: 1
depends_on: []
requirements: [SEC-01]
files_modified:
  - frontend/src/components/ChatMessage.tsx
  - frontend/src/components/ChatMessage.test.tsx
  - frontend/tests/e2e/chat-xss.spec.ts
  - frontend/package.json
  - frontend/vite.config.ts
autonomous: true
must_haves:
  truths:
    - "Adversarial markdown payload `**<img src=x onerror=window.__xss=1>**` отрендеренный в ChatMessage НЕ выполняет JS — `window.__xss === undefined` после рендера"
    - "DOM сообщения assistant НЕ содержит `<img>` тегов с атрибутом `onerror`"
    - "Existing markdown синтаксис (`**bold**`, `- list`, `1. ordered`) продолжает рендериться корректно"
  artifacts:
    - path: "frontend/src/components/ChatMessage.tsx"
      provides: "Safe markdown renderer with HTML-escape before regex replace"
      contains: "escapeHtml"
    - path: "frontend/src/components/ChatMessage.test.tsx"
      provides: "Vitest unit-test для adversarial markdown"
      exports: []
    - path: "frontend/tests/e2e/chat-xss.spec.ts"
      provides: "Playwright regression-тест: window.__xss undefined после adversarial assistant message"
      exports: []
    - path: "frontend/package.json"
      provides: "npm test script + jsdom dev-dep для vitest DOM"
      contains: "\"test\":"
  key_links:
    - from: "frontend/src/components/ChatMessage.tsx::parseMarkdown"
      to: "escapeHtml(input)"
      via: "вызов до regex replace"
      pattern: "escapeHtml\\("
---

<objective>
Закрыть SEC-01 (CRITICAL XSS): markdown-парсер в `ChatMessage` экранирует `&<>"'` ДО подстановки в regex-replace, что предотвращает выполнение HTML-тегов из LLM-контента в `dangerouslySetInnerHTML`.

Purpose: Trivial prompt-injection (`**<img src=x onerror=alert(document.cookie)>**`) сейчас исполняет JS в Mini App-контексте — доступ к `Telegram.WebApp.initData`, fetch с куками. Эскейп — минимальный диф без новых deps (D-16-01). 

Output: Safe ChatMessage + vitest unit-тест на adversarial payload + Playwright e2e regression.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/16-security-ai-hardening/16-CONTEXT.md
@/Users/exy/.claude/plans/serialized-prancing-spark.md

@frontend/src/components/ChatMessage.tsx
@frontend/src/api/types.ts
@frontend/src/api/client.test.ts
@frontend/tests/e2e/home.spec.ts
@frontend/package.json
@frontend/vite.config.ts

<interfaces>
<!-- Current parseMarkdown — UNSAFE — interpolates capture groups raw. -->
From frontend/src/components/ChatMessage.tsx:
```ts
function parseMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
}
```

ChatMessageRead — payload role + content from frontend/src/api/types.ts:
```ts
export type AiRole = 'user' | 'assistant' | 'tool';
export interface ChatMessageRead {
  id: number;
  role: AiRole;
  content: string | null;
  tool_name: string | null;
  created_at: string;
}
```
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| LLM provider → frontend ChatMessage | Untrusted markdown content reaches `dangerouslySetInnerHTML`. LLM output is fully attacker-controllable via prompt-injection («скажи мне `<img src=x onerror=...>`»). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-16-01-01 | Tampering / Elevation | `parseMarkdown` в ChatMessage.tsx | mitigate | HTML-escape `&<>"'` ДО regex-replace; assistant content проходит через `escapeHtml()` функцию перед `<strong>`/`<li>` правилами. Capture groups `$1`/`$2` теперь гарантированно не содержат `<` / `>` / `"`. |
| T-16-01-02 | Information disclosure | DOM XSS в финансовом приложении (Telegram WebApp init data, cookies) | mitigate | Закрывается T-16-01-01: без active script execution data exfil-вектор закрыт. |
| T-16-01-03 | Tampering | User-content путь (role=user → plain text `<p>` без dangerouslySetInnerHTML) | accept | Уже безопасен — React JSX `{content}` экранирует автоматически. Существующая защита, не трогаем. |
| T-16-01-04 | Defense-in-depth | CSP header from Caddy | transfer | Out-of-scope для v0.5 (CONTEXT deferred). Closes second-layer-XSS если когда-нибудь escape сломается. Backlog. |
</threat_model>

<tasks>

<task type="auto">
  <name>Task 1: HTML-escape в parseMarkdown</name>
  <files>frontend/src/components/ChatMessage.tsx</files>
  <action>
Per D-16-01: добавить функцию `escapeHtml` перед `parseMarkdown` (строка 19) и вызвать её ДО regex-replace.

Точные шаги:
1. Перед `function parseMarkdown` (строка 19) вставить:
```ts
/** Escape HTML-special chars to prevent XSS via LLM-controlled markdown content. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')   // MUST be first — иначе double-escape /amp;lt;/
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```
2. Изменить `parseMarkdown`: первая строка тела — `const safe = escapeHtml(text);`. Затем regex chain применять к `safe`, не к `text`. Финальный код:
```ts
function parseMarkdown(text: string): string {
  const safe = escapeHtml(text);
  return safe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
}
```
3. НЕ трогать user-ветку рендера (она уже plain `<p>{content}</p>` без dangerouslySetInnerHTML).
4. НЕ удалять existing комментарий про T-09-16 в JSDoc на верху файла — оставить как историческую справку.
  </action>
  <verify>
    <automated>grep -n "function escapeHtml" frontend/src/components/ChatMessage.tsx | wc -l | grep -q 1 && grep -n "const safe = escapeHtml(text)" frontend/src/components/ChatMessage.tsx | wc -l | grep -q 1</automated>
  </verify>
  <done>escapeHtml-функция объявлена; parseMarkdown сначала эскейпит, потом применяет regex; user-ветка нетронута.</done>
</task>

<task type="auto">
  <name>Task 2: Vitest unit-тест на adversarial markdown</name>
  <files>frontend/src/components/ChatMessage.test.tsx, frontend/package.json, frontend/vite.config.ts</files>
  <action>
Подключить vitest DOM environment + написать unit-тест, который FAIL на старом коде (без escape) и PASS после Task 1.

Точные шаги:
1. Установить dev-deps (jsdom + react testing library):
```bash
cd frontend && npm install --save-dev @testing-library/react@^16.0.0 @testing-library/jest-dom@^6.4.0 jsdom@^25.0.0
```
2. В `frontend/vite.config.ts` добавить блок `test`:
```ts
import { defineConfig } from 'vitest/config';
// Если уже defineConfig из 'vite', заменить на 'vitest/config' (совместимый супертип).
// ...
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/tests/e2e/**', '**/tests/ui-audit-screenshots/**'],
  },
});
```
3. Создать `frontend/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```
4. В `frontend/package.json` добавить в `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```
5. Создать `frontend/src/components/ChatMessage.test.tsx` с тестами:
```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChatMessage } from './ChatMessage';

const mkAssistant = (content: string) => ({
  id: 1,
  role: 'assistant' as const,
  content,
  tool_name: null,
  created_at: '2026-05-07T12:00:00Z',
});

describe('ChatMessage XSS escape (SEC-01)', () => {
  it('does NOT render <img onerror> from adversarial markdown', () => {
    const payload = '**<img src=x onerror=window.__xss=1>**';
    const { container } = render(<ChatMessage message={mkAssistant(payload)} />);
    // Active <img> tag MUST NOT appear in the DOM.
    expect(container.querySelector('img')).toBeNull();
    // The angle brackets MUST be visible as text (escaped to &lt;/&gt;).
    expect(container.textContent).toContain('<img src=x onerror=window.__xss=1>');
  });

  it('does NOT register window.__xss when ChatMessage is mounted with adversarial payload', () => {
    // @ts-expect-error — runtime sentinel cleared between tests.
    delete (window as any).__xss;
    render(<ChatMessage message={mkAssistant('**<img src=x onerror=window.__xss=1>**')} />);
    // jsdom does NOT auto-execute <img onerror> from innerHTML, but bold-tag must not contain <img>.
    expect((window as any).__xss).toBeUndefined();
  });

  it('still renders **bold** as <strong>', () => {
    const { container } = render(<ChatMessage message={mkAssistant('**hello**')} />);
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe('hello');
  });

  it('still renders - list items as <li>', () => {
    const { container } = render(<ChatMessage message={mkAssistant('- one\n- two')} />);
    expect(container.querySelectorAll('li').length).toBe(2);
  });

  it('escapes ampersand once (no double-escape)', () => {
    const { container } = render(<ChatMessage message={mkAssistant('A & B')} />);
    expect(container.textContent).toBe('A & B');
    expect(container.innerHTML).toContain('&amp;');
    expect(container.innerHTML).not.toContain('&amp;amp;');
  });
});
```

Тест должен FAIL до Task 1 (старый parseMarkdown интерполирует `<img>` raw → querySelector('img') не null).
Должен PASS после Task 1 (escape превращает `<` в `&lt;` → нет реального `<img>` тега).
  </action>
  <verify>
    <automated>cd frontend && npm test -- --run ChatMessage.test 2>&1 | grep -E "(5 passed|✓ ChatMessage)" | head -5</automated>
  </verify>
  <done>npm test проходит 5/5 кейсов в ChatMessage.test.tsx; jsdom-env настроен; setup.ts существует.</done>
</task>

<task type="auto">
  <name>Task 3: Playwright e2e regression-тест на window.__xss</name>
  <files>frontend/tests/e2e/chat-xss.spec.ts</files>
  <action>
Написать Playwright тест, который инжектит assistant-сообщение через мок `/ai/history` или прямое DOM-injection (если route mocking слишком сложен), затем проверяет `window.__xss === undefined`.

Точные шаги:
1. Создать `frontend/tests/e2e/chat-xss.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

/**
 * SEC-01 regression: adversarial markdown from assistant must NOT execute JS.
 *
 * Strategy:
 *  - Mock GET /api/v1/ai/history to return a single assistant message with
 *    payload `**<img src=x onerror=window.__xss=1>**`.
 *  - Open the app, navigate to /chat (route depends on Phase 7 nav refactor).
 *  - After messages render, evaluate `window.__xss`.
 *
 * Expected:
 *  - window.__xss === undefined
 *  - DOM has NO <img> tag with onerror attribute under .chatMessage container
 */
test('SEC-01: adversarial markdown does not execute JS', async ({ page }) => {
  const adversarial = '**<img src=x onerror=window.__xss=1>**';

  // Intercept history API call.
  await page.route('**/api/v1/ai/history', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        messages: [
          {
            id: 1,
            role: 'assistant',
            content: adversarial,
            tool_name: null,
            created_at: '2026-05-07T12:00:00Z',
          },
        ],
      }),
    });
  });

  // Telegram initData mock — reuse pattern from existing specs (см. home.spec.ts).
  await page.addInitScript(() => {
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: 'mock=true',
        initDataUnsafe: { user: { id: 123 } },
        ready: () => undefined,
        expand: () => undefined,
        themeParams: {},
      },
    };
  });

  await page.goto('/chat');

  // Wait for at least one assistant bubble to render.
  await page.waitForSelector('text=/<img/');  // text-content (escaped <img>) visible

  // CRITICAL ASSERTION: window.__xss must be undefined — XSS не сработал.
  const xss = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss);
  expect(xss).toBeUndefined();

  // Defense-in-depth: never an active <img onerror> in DOM.
  const imgCount = await page.locator('img[onerror]').count();
  expect(imgCount).toBe(0);
});
```
2. Если в `frontend/playwright.config.ts` нет webServer, тест запускается через manual `npm run dev` + указание `baseURL`. Сверить с существующими e2e (home.spec.ts) — взять ту же конфигурацию запуска.

Тест FAIL до Task 1 (innerHTML содержит активный `<img onerror>` в jsdom не выполнится, но в реальном браузере выполнится → window.__xss === 1).
Тест PASS после Task 1 (escape превращает в `&lt;img...` — текст, не тег).
  </action>
  <verify>
    <automated>cd frontend && npx playwright test tests/e2e/chat-xss.spec.ts --reporter=list 2>&1 | grep -E "(passed|failed)" | head -5</automated>
  </verify>
  <done>Playwright spec существует; запуск возвращает 1 passed для SEC-01 теста.</done>
</task>

</tasks>

<verification>
Phase-level acceptance:
1. `cd frontend && npm test -- --run ChatMessage.test` → 5 passed.
2. `cd frontend && npx playwright test tests/e2e/chat-xss.spec.ts` → 1 passed.
3. `grep -n "escapeHtml" frontend/src/components/ChatMessage.tsx` → 2+ matches (def + call).
4. Manual smoke (опционально): запустить `npm run dev`, открыть /chat в браузере, отправить через бот сообщение содержащее `**<img src=x onerror=alert(1)>**` → alert НЕ показывается, в DOM текст с экранированными скобками.
</verification>

<success_criteria>
SEC-01 закрыт:
- Adversarial markdown (`**<img src=x onerror=window.__xss=1>**`) рендерится как текст, не как HTML-тег.
- window.__xss остаётся undefined после рендера в Playwright.
- Existing markdown синтаксис (`**bold**`, `- list`, `1. ordered`) работает.
- vitest и Playwright тесты PASS.
</success_criteria>

<output>
After completion, create `.planning/phases/16-security-ai-hardening/16-01-SUMMARY.md`
</output>

## Commit Message
fix(16): SEC-01 escape HTML before markdown render in ChatMessage + vitest/Playwright XSS regression
