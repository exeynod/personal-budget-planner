// AuthGate — hard security boundary. The interactive shell (children) must
// mount ONLY on an authorized /me; 401/403 must render AccessRequiredScreen
// with no shell present; transient errors keep a Retry.

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { AuthGate } from "../AuthGate";
import { AuthError } from "../../../api/client";

const getMeV10Mock = vi.fn();
vi.mock("../../../api/me", () => ({
  getMeV10: (...args: unknown[]) => getMeV10Mock(...args),
}));

beforeEach(() => {
  getMeV10Mock.mockReset();
});
afterEach(cleanup);

const Shell = () => <div data-testid="shell-child">SHELL</div>;

describe("AuthGate", () => {
  it("authorized /me → mounts children (shell), no access wall", async () => {
    getMeV10Mock.mockResolvedValue({
      tg_user_id: 1,
      onboarded_at: "2026-01-01T00:00:00Z",
      role: "owner",
    });
    render(
      <AuthGate>
        <Shell />
      </AuthGate>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("shell-child")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("access-required")).toBeNull();
  });

  it("403 forbidden → ONLY AccessRequiredScreen, shell absent", async () => {
    getMeV10Mock.mockRejectedValue(new AuthError(403, "{}"));
    render(
      <AuthGate>
        <Shell />
      </AuthGate>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("access-required")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("shell-child")).toBeNull();
  });

  it("401 unauthenticated → AccessRequiredScreen, shell absent", async () => {
    getMeV10Mock.mockRejectedValue(new AuthError(401, "{}"));
    render(
      <AuthGate>
        <Shell />
      </AuthGate>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("access-required")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("shell-child")).toBeNull();
  });

  it("probes /me exactly once for a denied user", async () => {
    getMeV10Mock.mockRejectedValue(new AuthError(403, "{}"));
    render(
      <AuthGate>
        <Shell />
      </AuthGate>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("access-required")).toBeInTheDocument(),
    );
    expect(getMeV10Mock).toHaveBeenCalledTimes(1);
  });

  it("transient (network/5xx) error → Retry state, shell absent", async () => {
    getMeV10Mock.mockRejectedValue(new Error("network down"));
    render(
      <AuthGate>
        <Shell />
      </AuthGate>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("auth-error")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("shell-child")).toBeNull();
    expect(screen.queryByTestId("access-required")).toBeNull();
  });
});
