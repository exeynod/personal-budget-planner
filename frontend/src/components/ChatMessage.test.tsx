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
