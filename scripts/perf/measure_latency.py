"""End-to-end latency profiler for the dev API (DEV_MODE → no initData needed).

Hits each GET endpoint N times, discards warmup, reports p50/p95/p99/max/mean (ms).
Stdlib only (urllib) — run on host:  python3 scripts/perf/measure_latency.py

Override base/N via env: PERF_BASE (default http://localhost:8000), PERF_N (40).
"""

from __future__ import annotations

import os
import time
import urllib.request

BASE = os.environ.get("PERF_BASE", "http://localhost:8000")
N = int(os.environ.get("PERF_N", "40"))
WARMUP = 3

# period_id=1 is the active period; period 2 is a closed historical one.
ENDPOINTS = [
    "/api/v1/home",
    "/api/v1/periods",
    "/api/v1/periods/current",
    "/api/v1/periods/1/balance",
    "/api/v1/periods/1/plan",
    "/api/v1/periods/1/planned",
    "/api/v1/periods/1/actual",
    "/api/v1/subscriptions",
    "/api/v1/subscriptions/recurring/cashflow",
    "/api/v1/subscriptions/recurring/due",
    "/api/v1/accounts",
    "/api/v1/actual/balance",
    "/api/v1/analytics/trend",
    "/api/v1/analytics/top-categories",
    "/api/v1/analytics/top-overspend",
    "/api/v1/analytics/forecast",
]


def pct(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def measure(path: str) -> dict:
    url = BASE + path
    samples: list[float] = []
    status = None
    size = 0
    for i in range(N + WARMUP):
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                body = r.read()
                status = r.status
                size = len(body)
        except Exception as e:  # noqa: BLE001
            status = f"ERR:{type(e).__name__}"
            body = b""
        dt = (time.perf_counter() - t0) * 1000.0
        if i >= WARMUP:
            samples.append(dt)
    s = sorted(samples)
    return {
        "path": path,
        "status": status,
        "kb": round(size / 1024, 1),
        "p50": pct(s, 0.50),
        "p95": pct(s, 0.95),
        "p99": pct(s, 0.99),
        "max": s[-1] if s else 0.0,
        "mean": sum(s) / len(s) if s else 0.0,
    }


def main() -> None:
    print(f"Base={BASE}  N={N} (+{WARMUP} warmup)\n")
    hdr = f"{'endpoint':42} {'status':8} {'kb':>6} {'p50':>8} {'p95':>8} {'p99':>8} {'max':>8}"
    print(hdr)
    print("-" * len(hdr))
    rows = []
    for ep in ENDPOINTS:
        r = measure(ep)
        rows.append(r)
        print(
            f"{r['path']:42} {str(r['status']):8} {r['kb']:>6} "
            f"{r['p50']:>8.1f} {r['p95']:>8.1f} {r['p99']:>8.1f} {r['max']:>8.1f}"
        )
    print("\nSlowest by p95:")
    for r in sorted(rows, key=lambda x: x["p95"], reverse=True)[:5]:
        print(f"  {r['p95']:>8.1f}ms p95  {r['path']}  ({r['kb']}kb)")


if __name__ == "__main__":
    main()
