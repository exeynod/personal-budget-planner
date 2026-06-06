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
    try {
      await getMeV10();
      setState({ status: "authorized" });
    } catch (err) {
      if (err instanceof AuthError) {
        setState({ status: "denied", kind: err.kind });
        return;
      }
      // Transient (network / 5xx) — keep a Retry; do NOT fall through to a
      // usable shell.
      setState({ status: "error" });
    }
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
