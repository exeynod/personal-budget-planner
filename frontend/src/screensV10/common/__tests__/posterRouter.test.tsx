// Phase 25-02: PosterRouter (web) — symmetric to iOS PosterRouter contract.
// Tests cover push / pop / popToRoot / canPop / MAX_STACK cap / direction flag.

import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  PosterRouterProvider,
  usePosterRouter,
  type PosterRouterAPI,
} from '../PosterRouter';

// Test consumer that exposes the router API to the test via a callback ref.
function ApiCapture({ apiRef }: { apiRef: { current: PosterRouterAPI | null } }) {
  apiRef.current = usePosterRouter();
  return null;
}

function renderRouter(root: ReactNode) {
  const apiRef: { current: PosterRouterAPI | null } = { current: null };
  const utils = render(
    <PosterRouterProvider root={root}>
      <ApiCapture apiRef={apiRef} />
    </PosterRouterProvider>
  );
  if (!apiRef.current) throw new Error('apiRef not captured');
  return { ...utils, apiRef };
}

describe('PosterRouter — initial state', () => {
  it('renders root node only; canPop=false; direction=forward', () => {
    const { apiRef } = renderRouter(<div data-testid="root">root</div>);
    expect(screen.getByTestId('root')).toBeInTheDocument();
    expect(apiRef.current!.stack).toHaveLength(1);
    expect(apiRef.current!.canPop).toBe(false);
    expect(apiRef.current!.direction).toBe('forward');
  });

  it('throws when usePosterRouter called outside provider', () => {
    function NoProvider() {
      usePosterRouter();
      return null;
    }
    // Suppress React error logging for this expected throw.
    const orig = console.error;
    console.error = () => {};
    try {
      expect(() => render(<NoProvider />)).toThrow(/PosterRouter/);
    } finally {
      console.error = orig;
    }
  });
});

describe('PosterRouter — push', () => {
  it('push() makes only the top entry visible; root removed from DOM', () => {
    const { apiRef } = renderRouter(<div data-testid="root">root</div>);
    act(() => apiRef.current!.push(<div data-testid="b">b</div>));
    expect(screen.queryByTestId('root')).not.toBeInTheDocument();
    expect(screen.getByTestId('b')).toBeInTheDocument();
    expect(apiRef.current!.canPop).toBe(true);
    expect(apiRef.current!.direction).toBe('forward');
    expect(apiRef.current!.stack).toHaveLength(2);
  });

  it('push then pop restores root visibility; direction=backward', () => {
    const { apiRef } = renderRouter(<div data-testid="root">root</div>);
    act(() => apiRef.current!.push(<div data-testid="b">b</div>));
    act(() => apiRef.current!.pop());
    expect(screen.getByTestId('root')).toBeInTheDocument();
    expect(screen.queryByTestId('b')).not.toBeInTheDocument();
    expect(apiRef.current!.canPop).toBe(false);
    expect(apiRef.current!.direction).toBe('backward');
  });

  it('caps stack at 16 (MAX_STACK), shifting oldest entries silently', () => {
    const { apiRef } = renderRouter(<div data-testid="root">root</div>);
    // Push 17 entries (root + 17 = 18 → cap to 16)
    act(() => {
      for (let i = 0; i < 17; i++) {
        apiRef.current!.push(<div data-testid={`p${i}`}>p{i}</div>);
      }
    });
    expect(apiRef.current!.stack).toHaveLength(16);
    // Top of stack must be the most recently pushed (`p16`).
    expect(screen.getByTestId('p16')).toBeInTheDocument();
    // Root and earliest pushes were shifted out — root not in stack data.
    const ids = apiRef.current!.stack.map((e) => e.node);
    expect(ids).toHaveLength(16);
  });
});

describe('PosterRouter — pop', () => {
  it('pop on root is a no-op', () => {
    const { apiRef } = renderRouter(<div data-testid="root">root</div>);
    const beforeStack = apiRef.current!.stack;
    act(() => apiRef.current!.pop());
    expect(apiRef.current!.stack).toBe(beforeStack);
    expect(apiRef.current!.stack).toHaveLength(1);
  });
});

describe('PosterRouter — popToRoot', () => {
  it('popToRoot truncates stack to root; direction=backward', () => {
    const { apiRef } = renderRouter(<div data-testid="root">root</div>);
    act(() => {
      apiRef.current!.push(<div data-testid="a">a</div>);
      apiRef.current!.push(<div data-testid="b">b</div>);
      apiRef.current!.push(<div data-testid="c">c</div>);
    });
    expect(apiRef.current!.stack).toHaveLength(4);
    act(() => apiRef.current!.popToRoot());
    expect(apiRef.current!.stack).toHaveLength(1);
    expect(screen.getByTestId('root')).toBeInTheDocument();
    expect(apiRef.current!.canPop).toBe(false);
    expect(apiRef.current!.direction).toBe('backward');
  });

  it('popToRoot on root is a no-op (state ref unchanged)', () => {
    const { apiRef } = renderRouter(<div data-testid="root">root</div>);
    const before = apiRef.current!.stack;
    act(() => apiRef.current!.popToRoot());
    expect(apiRef.current!.stack).toBe(before);
  });
});

describe('PosterRouter — animation class on view wrapper', () => {
  it('applies poster-slide-in-fwd after push', () => {
    const { apiRef, container } = renderRouter(<div data-testid="root">root</div>);
    act(() => apiRef.current!.push(<div data-testid="a">a</div>));
    const wrap = container.querySelector('.poster-slide-in-fwd');
    expect(wrap).not.toBeNull();
  });

  it('applies poster-slide-in-back after pop', () => {
    const { apiRef, container } = renderRouter(<div data-testid="root">root</div>);
    act(() => apiRef.current!.push(<div data-testid="a">a</div>));
    act(() => apiRef.current!.pop());
    const wrap = container.querySelector('.poster-slide-in-back');
    expect(wrap).not.toBeNull();
  });
});
