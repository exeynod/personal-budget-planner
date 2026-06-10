// Frontend load profiler — measures real bundle download + boot + /home + render
// against the production-like dev caddy (http://localhost: built SPA + /api proxy).
//
// Run from frontend/:  node ../scripts/perf/profile_frontend.mjs
// Uses Playwright from frontend/node_modules. Emulates mobile network + CPU via CDP.

import { chromium } from "@playwright/test";

const BASE = process.env.PERF_FE_BASE || "http://localhost";

// Network/CPU profiles (Lighthouse-ish). throughput in BYTES/sec.
const PROFILES = [
  {
    name: "local (no throttle)",
    offline: false,
    dl: -1,
    ul: -1,
    lat: 0,
    cpu: 1,
  },
  {
    name: "fast-4g + 4x CPU",
    offline: false,
    dl: 4_000_000 / 8,
    ul: 3_000_000 / 8,
    lat: 40,
    cpu: 4,
  },
  {
    name: "slow-4g + 6x CPU",
    offline: false,
    dl: 1_600_000 / 8,
    ul: 750_000 / 8,
    lat: 150,
    cpu: 6,
  },
];

async function profile(browser, prof) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 12-ish
    deviceScaleFactor: 3,
    isMobile: true,
  });
  // Bypass cookie banner + force native theme (mirrors e2e fixtures).
  await ctx.addInitScript(() => {
    window.localStorage.setItem("ui.theme", "liquid_glass");
    window.localStorage.setItem("cookie_consent_v1", "acknowledged");
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  if (prof.dl > 0) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: prof.dl,
      uploadThroughput: prof.ul,
      latency: prof.lat,
    });
  }
  if (prof.cpu > 1)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: prof.cpu });

  const reqs = [];
  let homeMs = null;
  const t0 = Date.now();
  page.on("response", async (resp) => {
    const url = resp.url();
    let size = 0;
    try {
      size = (await resp.body()).length;
    } catch {
      /* redirect/no body */
    }
    const rec = {
      url,
      type: resp.request().resourceType(),
      status: resp.status(),
      size,
      at: Date.now() - t0,
    };
    reqs.push(rec);
    if (url.includes("/api/v1/home") && homeMs === null) homeMs = rec.at;
  });

  await page.goto(BASE, { waitUntil: "load", timeout: 60_000 });
  // Give the SPA a moment to fire its data fetch + first render after load.
  await page
    .waitForLoadState("networkidle", { timeout: 60_000 })
    .catch(() => {});
  const wall = Date.now() - t0;

  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] || {};
    const paints = Object.fromEntries(
      performance
        .getEntriesByType("paint")
        .map((p) => [p.name, Math.round(p.startTime)]),
    );
    let lcp = 0;
    try {
      const l = performance.getEntriesByType("largest-contentful-paint");
      if (l.length) lcp = Math.round(l[l.length - 1].startTime);
    } catch {
      /* not all browsers */
    }
    return {
      domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0),
      load: Math.round(n.loadEventEnd || 0),
      responseEnd: Math.round(n.responseEnd || 0),
      fcp: paints["first-contentful-paint"] || 0,
      lcp,
    };
  });

  const totalBytes = reqs.reduce((a, r) => a + r.size, 0);
  const js = reqs.filter((r) => r.type === "script");
  const jsBytes = js.reduce((a, r) => a + r.size, 0);
  const apiReqs = reqs.filter((r) => r.url.includes("/api/"));

  await ctx.close();
  return {
    prof: prof.name,
    wall,
    homeMs,
    nav,
    nReq: reqs.length,
    totalKB: Math.round(totalBytes / 1024),
    jsKB: Math.round(jsBytes / 1024),
    nApi: apiReqs.length,
    apiReqs,
  };
}

const browser = await chromium.launch();
console.log(`Target: ${BASE}\n`);
const results = [];
for (const p of PROFILES) {
  const r = await profile(browser, p);
  results.push(r);
  console.log(`── ${r.prof}`);
  console.log(
    `   wall(goto→idle)=${r.wall}ms  load=${r.nav.load}ms  FCP=${r.nav.fcp}ms  LCP=${r.nav.lcp}ms  DCL=${r.nav.domContentLoaded}ms`,
  );
  console.log(
    `   requests=${r.nReq} (api=${r.nApi})  transferred=${r.totalKB}KB (js=${r.jsKB}KB)  /home arrived @${r.homeMs}ms`,
  );
  console.log(
    `   api calls in order: ${r.apiReqs.map((a) => a.url.replace(BASE, "").replace("/api/v1", "") + "@" + a.at + "ms").join("  ")}`,
  );
  console.log("");
}
await browser.close();
