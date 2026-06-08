// AuthGate — the hard security boundary for the v10 web shell.
//
// Probes GET /me ONCE on mount and renders:
//   - authorized (2xx)        → children (the interactive shell mounts here,
//                               and ONLY here)
//   - denied   (401/403)      → <AccessRequiredScreen/> — a static dead-end
//                               with zero app chrome; no Retry (a 403 won't
//                               change on retry)
//   - error    (5xx/network)  → transient error + Retry (re-probe)
//
// By rendering AccessRequiredScreen INSTEAD of the shell (not a disabled
// shell), an unauthorized user has no TabBar / FAB / AddSheet / pushable
// screen to interact with and triggers no data calls beyond this probe.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getMeV10 } from "../../api/me";
import { getHome } from "../../api/home";
import { seedCache, CACHE_KEYS } from "../../api/cache";
import { AuthError } from "../../api/client";
import { AccessRequiredScreen } from "./AccessRequiredScreen";
import styles from "./AuthGate.module.css";

type GateState =
  | { status: "loading" }
  | { status: "authorized" }
  | { status: "denied"; kind: "unauthenticated" | "forbidden" }
  | { status: "error" };

export interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<GateState>({ status: "loading" });

  const probe = useCallback(async () => {
    setState({ status: "loading" });
    // Single prewarm point: fire the /me auth probe AND the aggregated /home
    // bootstrap concurrently. The auth verdict comes SOLELY from the /me
    // result; /home is best-effort — if it FULFILLS we seed the granular
    // caches so the post-gate shell (period provider, onboarding check,
    // HomeMount) renders warm with ZERO extra network. A /home REJECTION
    // (e.g. 409 onboarding_required for a not-yet-onboarded user, or any
    // transient error) is intentionally ignored here — children fetch
    // normally and must NOT flip auth to denied/error.
    const [meResult, homeResult] = await Promise.allSettled([
      getMeV10(),
      getHome(),
    ]);

    if (homeResult.status === "fulfilled") {
      const home = homeResult.value;
      seedCache(CACHE_KEYS.me, home.user);
      seedCache(CACHE_KEYS.accounts, home.accounts);
      seedCache(CACHE_KEYS.categories(false), home.categories);
      // `periods` / `planned` are newer fields — tolerate older payloads /
      // mocks that omit them (treat as []), mirroring isHomeBootstrap.
      seedCache(CACHE_KEYS.periods, home.periods ?? []);
      seedCache(CACHE_KEYS.currentPeriod, home.period);
      if (home.period) {
        seedCache(CACHE_KEYS.actuals(home.period.id), home.actuals);
        seedCache(CACHE_KEYS.balance(home.period.id), home.balance);
        seedCache(CACHE_KEYS.planned(home.period.id), home.planned ?? []);
      }
    }

    if (meResult.status === "fulfilled") {
      setState({ status: "authorized" });
      return;
    }
    const err = meResult.reason;
    if (err instanceof AuthError) {
      setState({ status: "denied", kind: err.kind });
      return;
    }
    // Transient (network / 5xx) — keep a Retry; do NOT fall through to a
    // usable shell.
    setState({ status: "error" });
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  if (state.status === "authorized") {
    return <>{children}</>;
  }

  if (state.status === "denied") {
    return <AccessRequiredScreen kind={state.kind} />;
  }

  if (state.status === "error") {
    return (
      <div className={styles.gate} data-testid="auth-error">
        <div className={styles.eyebrow}>Ошибка</div>
        <div className={styles.message}>Не удалось связаться с сервером.</div>
        <button
          type="button"
          className={styles.retryBtn}
          onClick={() => void probe()}
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className={styles.gate} data-testid="auth-loading">
      <div className={styles.eyebrow}>Загрузка…</div>
    </div>
  );
}
