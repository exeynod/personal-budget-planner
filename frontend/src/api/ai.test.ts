// Phase 71 (UX-71, web parity with iOS AI-CHAT-2): streamChat must surface a
// 402 PRO_TIER_REQUIRED on POST /ai/chat as the opaque PRO_TIER_ERROR_MARKER —
// NOT the raw "HTTP 402" — so the chat UI can render a fixed paywall message
// without leaking the server detail.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { streamChat, PRO_TIER_ERROR_MARKER } from './ai';
import type { AiStreamEvent } from './types';

function makeResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Run streamChat to completion, collecting every emitted event. */
function collectEvents(): {
  promise: Promise<AiStreamEvent[]>;
  events: AiStreamEvent[];
} {
  const events: AiStreamEvent[] = [];
  const promise = new Promise<AiStreamEvent[]>((resolve) => {
    streamChat(
      'how much did I spend?',
      (e) => events.push(e),
      () => resolve(events),
    );
  });
  return { promise, events };
}

describe('streamChat 402 PRO_TIER_REQUIRED handling', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('emits PRO_TIER_ERROR_MARKER (not "HTTP 402") on a 402 PRO_TIER_REQUIRED body', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(
        402,
        JSON.stringify({
          detail: {
            error: 'PRO_TIER_REQUIRED',
            message: 'Эта функция доступна только в Pro-тарифе.',
            current_tier: 'free',
          },
        }),
      ),
    );

    const { promise } = collectEvents();
    const events = await promise;

    expect(events).toContainEqual({
      type: 'error',
      data: PRO_TIER_ERROR_MARKER,
    });
    // Belt-and-braces: the raw "HTTP 402" must never reach the UI.
    expect(events).not.toContainEqual({ type: 'error', data: 'HTTP 402' });
    // The server detail string must not leak either (no-leak convention).
    const errEvent = events.find((e) => e.type === 'error');
    expect(errEvent?.data).not.toContain('Pro-тарифе');
  });

  it('classifies a 402 via status code even when the body is non-JSON', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(402, '<html>402</html>'));

    const { promise } = collectEvents();
    const events = await promise;

    expect(events).toContainEqual({
      type: 'error',
      data: PRO_TIER_ERROR_MARKER,
    });
  });

  it('keeps the generic "HTTP {status}" signal for non-402 failures', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(500, '{"detail":"boom"}'));

    const { promise } = collectEvents();
    const events = await promise;

    expect(events).toContainEqual({ type: 'error', data: 'HTTP 500' });
    expect(events).not.toContainEqual({
      type: 'error',
      data: PRO_TIER_ERROR_MARKER,
    });
  });
});
