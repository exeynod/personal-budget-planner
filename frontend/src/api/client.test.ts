import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@telegram-apps/sdk-react', () => ({
  retrieveLaunchParams: () => ({}),
  retrieveRawLaunchParams: () => '',
  openTelegramLink: () => undefined,
}));

import { apiFetch, ApiError, OnboardingRequiredError } from './client';

describe('apiFetch 409 sub-shape detection', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function makeResponse(status: number, body: string): Response {
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('throws OnboardingRequiredError on 409 onboarding_required body', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(409, JSON.stringify({ detail: { error: 'onboarding_required' } })),
    );
    await expect(apiFetch('/categories')).rejects.toBeInstanceOf(OnboardingRequiredError);
  });

  it('throws plain ApiError on 409 with different body shape (e.g. AlreadyOnboarded)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse(409, JSON.stringify({ detail: 'User 123 is already onboarded' })),
    );
    const err = await apiFetch('/onboarding/complete').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(OnboardingRequiredError);
    expect((err as ApiError).status).toBe(409);
  });

  it('throws plain ApiError on 409 with malformed JSON body', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(409, '<html>nginx 502</html>'));
    const err = await apiFetch('/anything').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(OnboardingRequiredError);
  });

  it('throws plain ApiError on non-409 errors', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(403, '{"detail":"Not authorized"}'));
    const err = await apiFetch('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(OnboardingRequiredError);
    expect((err as ApiError).status).toBe(403);
  });
});
