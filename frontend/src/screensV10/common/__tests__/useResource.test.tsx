// Phase 31 (code-quality): unit coverage for the useResource hook extracted
// from the v10 Mount components. Asserts the state machine (loading → ready /
// error), reload, the optimistic setData escape hatch, and the keepPreviousData
// re-fetch behaviour the Home / Transactions period switch relies on.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { useResource } from '../useResource';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

interface ProbeProps<T> {
  fetcher: (isCancelled: () => boolean) => Promise<T>;
  deps: ReadonlyArray<unknown>;
  keepPreviousData?: boolean;
  // Expose the hook result to the test via a render-prop sink.
  onResult?: (r: ReturnType<typeof useResource<T>>) => void;
}

function Probe<T>({
  fetcher,
  deps,
  keepPreviousData,
  onResult,
}: ProbeProps<T>) {
  const r = useResource<T>(fetcher, deps, { keepPreviousData });
  onResult?.(r);
  return (
    <div>
      <span data-testid="status">{r.status}</span>
      <span data-testid="refreshing">{r.refreshing ? '1' : '0'}</span>
      <span data-testid="data">{JSON.stringify(r.data)}</span>
      <span data-testid="error">{r.error ?? ''}</span>
      <button data-testid="reload" onClick={() => r.reload()}>
        reload
      </button>
      <button
        data-testid="patch"
        onClick={() => r.setData('patched' as unknown as T)}
      >
        patch
      </button>
    </div>
  );
}

describe('useResource', () => {
  it('starts loading, then resolves to ready with data', async () => {
    const fetcher = vi.fn().mockResolvedValue('hello');
    render(<Probe fetcher={fetcher} deps={[]} />);

    // Synchronously on first paint: loading.
    expect(screen.getByTestId('status').textContent).toBe('loading');

    await flush();
    expect(screen.getByTestId('status').textContent).toBe('ready');
    expect(screen.getByTestId('data').textContent).toBe('"hello"');
    expect(screen.getByTestId('error').textContent).toBe('');
  });

  it('surfaces an error and recovers on reload', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');
    render(<Probe fetcher={fetcher} deps={[]} />);
    await flush();

    expect(screen.getByTestId('status').textContent).toBe('error');
    expect(screen.getByTestId('error').textContent).toBe('boom');
    // On error the stale data is dropped (matches the old Mount behaviour).
    expect(screen.getByTestId('data').textContent).toBe('null');

    await act(async () => {
      screen.getByTestId('reload').click();
    });
    await flush();

    expect(screen.getByTestId('status').textContent).toBe('ready');
    expect(screen.getByTestId('data').textContent).toBe('"ok"');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('falls back to a generic message for non-Error throws', async () => {
    const fetcher = vi.fn().mockRejectedValue('plain string');
    render(<Probe fetcher={fetcher} deps={[]} />);
    await flush();
    expect(screen.getByTestId('status').textContent).toBe('error');
    expect(screen.getByTestId('error').textContent).toBe(
      'Не удалось загрузить данные',
    );
  });

  it('re-runs the fetcher when deps change', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('a')
      .mockResolvedValueOnce('b');

    const { rerender } = render(<Probe fetcher={fetcher} deps={[1]} />);
    await flush();
    expect(screen.getByTestId('data').textContent).toBe('"a"');

    rerender(<Probe fetcher={fetcher} deps={[2]} />);
    await flush();
    expect(screen.getByTestId('data').textContent).toBe('"b"');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('setData patches the loaded payload optimistically', async () => {
    const fetcher = vi.fn().mockResolvedValue('initial');
    render(<Probe fetcher={fetcher} deps={[]} />);
    await flush();
    expect(screen.getByTestId('data').textContent).toBe('"initial"');

    await act(async () => {
      screen.getByTestId('patch').click();
    });
    expect(screen.getByTestId('data').textContent).toBe('"patched"');
    expect(screen.getByTestId('status').textContent).toBe('ready');
  });

  it('keepPreviousData: initial load shows loading, re-fetch keeps data + refreshing', async () => {
    let resolveSecond: ((v: string) => void) | null = null;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockImplementationOnce(
        () =>
          new Promise<string>((res) => {
            resolveSecond = res;
          }),
      );

    const { rerender } = render(
      <Probe fetcher={fetcher} deps={[1]} keepPreviousData />,
    );
    // Initial mount still reports loading.
    expect(screen.getByTestId('status').textContent).toBe('loading');
    await flush();
    expect(screen.getByTestId('status').textContent).toBe('ready');
    expect(screen.getByTestId('data').textContent).toBe('"first"');

    // Deps change → re-fetch. With keepPreviousData the previous data stays on
    // screen (status 'ready'), refreshing flips true, NO loading flash.
    rerender(<Probe fetcher={fetcher} deps={[2]} keepPreviousData />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('status').textContent).toBe('ready');
    expect(screen.getByTestId('data').textContent).toBe('"first"');
    expect(screen.getByTestId('refreshing').textContent).toBe('1');

    // Resolve the in-flight fetch → new data, refreshing clears.
    await act(async () => {
      resolveSecond?.('second');
      await Promise.resolve();
    });
    expect(screen.getByTestId('data').textContent).toBe('"second"');
    expect(screen.getByTestId('refreshing').textContent).toBe('0');
  });
});
