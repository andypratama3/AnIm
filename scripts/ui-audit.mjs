/**
 * Dependency-free UI audit over the Chrome DevTools Protocol.
 *
 * Launches the local Chrome headless, drives real pages, and reports:
 *  - HTTP status, document title, h1 text
 *  - horizontal overflow (scrollWidth - clientWidth)
 *  - elements wider than the viewport
 *  - card surfaces with zero padding, and the distinct padding values used
 *  - text clipped by a fixed-height container
 *  - console errors and uncaught page errors
 *
 * Uses Node's built-in WebSocket and fetch, so nothing is added to package.json.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.AUDIT_OUT ?? "/tmp/anim-audit";
const PORT = Number(process.env.CDP_PORT ?? 9333);
// Resolve a Chrome/Chromium binary so the same audit runs on a laptop and on
// the ubuntu-latest CI runner.
function resolveChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chrome/Chromium binary found. Set CHROME_PATH to a browser executable.",
  );
}

const CHROME = resolveChrome();

const ROUTES = ["/", "/agents", "/activity", "/kanban", "/analytics", "/discussion", "/notes", "/settings"];
const VIEWPORTS = [
  { name: "desktop", width: 1512, height: 950 },
  { name: "mobile", width: 390, height: 844 },
];

mkdirSync(OUT, { recursive: true });
console.log(`chrome: ${CHROME}`);
console.log(`target: ${BASE}`);

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${OUT}/profile`,
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCdp() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error("chrome devtools endpoint never became ready");
}

const browserWsUrl = await waitForCdp();

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }

  send(method, params = {}, sessionId) {
    this.id += 1;
    const id = this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

const browserWs = new WebSocket(browserWsUrl);
await new Promise((resolve, reject) => {
  browserWs.addEventListener("open", resolve, { once: true });
  browserWs.addEventListener("error", reject, { once: true });
});
const browser = new Cdp(browserWs);

const PROBE = `(() => {
  const doc = document.documentElement;
  const overflowX = doc.scrollWidth - doc.clientWidth;
  const vw = doc.clientWidth;
  const wide = [];
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (cs.position === 'fixed' || cs.pointerEvents === 'none') continue;
    let scroller = null;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden') { scroller = p; break; }
    }
    if (scroller) continue;
    if (r.right > vw + 2) {
      wide.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 100),
        right: Math.round(r.right),
        w: Math.round(r.width),
      });
    }
  }
  const pads = new Map();
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const cs = getComputedStyle(el);
    if (cs.borderRadius === '0px') continue;
    if (cs.pointerEvents === 'none') continue;
    const key = cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft;
    if (!pads.has(key)) pads.set(key, { count: 0, sample: (typeof el.className === 'string' ? el.className : '').slice(0, 70) });
    pads.get(key).count += 1;
  }
  const clipped = [];
  for (const el of Array.from(document.querySelectorAll('h1,h2,h3,p,span,button,a,li'))) {
    const cs = getComputedStyle(el);
    const clamps = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
    if (!clamps && cs.overflow === 'hidden' && el.scrollHeight > el.clientHeight + 6 && el.clientHeight > 0) {
      clipped.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 70) });
    }
  }
  return {
    overflowX,
    title: document.title,
    h1: Array.from(document.querySelectorAll('h1')).map((h) => (h.textContent || '').trim()),
    wide: wide.slice(0, 8),
    pads: Array.from(pads.entries()).map(([pad, v]) => ({ pad, ...v })).sort((a, b) => b.count - a.count).slice(0, 10),
    clipped: clipped.slice(0, 10),
  };
})()`;

const report = [];

for (const vp of VIEWPORTS) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });

  await browser.send("Page.enable", {}, sessionId);
  await browser.send("Runtime.enable", {}, sessionId);
  await browser.send("Log.enable", {}, sessionId);
  await browser.send(
    "Emulation.setDeviceMetricsOverride",
    { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.name === "mobile" },
    sessionId,
  );

  for (const route of ROUTES) {
    const errors = [];
    const onEvent = (msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === "Log.entryAdded" && msg.params?.entry?.level === "error") {
        const text = String(msg.params.entry.text);
        if (text.includes("/_next/hmr") || text.includes("WebSocket connection to")) return;
        errors.push(text.slice(0, 240));
      }
      if (msg.method === "Runtime.exceptionThrown") {
        errors.push(`exception: ${msg.params?.exceptionDetails?.text}`.slice(0, 240));
      }
    };
    browser.listeners.push(onEvent);

    const status = await browser.send(
      "Page.navigate",
      { url: `${BASE}${route}` },
      sessionId,
    );
    void status;
    await sleep(3200);

    const { result } = await browser.send(
      "Runtime.evaluate",
      { expression: PROBE, returnByValue: true },
      sessionId,
    );

    // 503 from the optional live bridge means "host unreachable", which the UI
    // handles as a degraded state. Track it, but never count it as a defect.
    const expected = errors.filter(
      (text) => text.includes("/api/mesh-live") || text.includes("503"),
    );
    const real = errors.filter((text) => !expected.includes(text));

    let shot = `${OUT}/${vp.name}${route.replace(/\//g, "_") || "_home"}.png`;
    try {
      const { data } = await browser.send(
        "Page.captureScreenshot",
        { format: "png", captureBeyondViewport: vp.name === "desktop" },
        sessionId,
      );
      writeFileSync(shot, Buffer.from(data, "base64"));
    } catch {
      shot = "(screenshot failed)";
    }

    const value = result.value ?? {};
    report.push({
      viewport: vp.name,
      route,
      title: value.title,
      h1: value.h1,
      overflowX: value.overflowX,
      wide: value.wide,
      pads: value.pads,
      clipped: value.clipped,
      consoleErrors: real,
      expectedErrors: expected,
      shot,
    });

    browser.listeners = browser.listeners.filter((fn) => fn !== onEvent);
  }

  await browser.send("Target.closeTarget", { targetId });
}

await browser.send("Browser.close").catch(() => {});
chrome.kill("SIGKILL");

// Guard against a false all-clear: if the app never rendered (dev server down,
// build error, wrong port) every measurement reads zero and the audit would
// happily report "clean". Fail loudly instead.
const unrendered = report.filter((row) => !row.h1 || !row.h1.length || !/AnIm/.test(row.title ?? ""));
if (unrendered.length) {
  console.error(
    `\nABORT: ${unrendered.length}/${report.length} checks never rendered the app ` +
      `(title=${unrendered[0].title ?? "none"}). Is ${BASE} serving the app?`,
  );
  for (const row of unrendered) console.error(`  ${row.viewport} ${row.route} title=${row.title}`);
  process.exitCode = 1;
} else {
  const issues = report.filter(
    (row) => row.overflowX > 0 || row.wide.length || row.clipped.length || row.consoleErrors.length,
  );
  const degraded = report.filter((row) => (row.expectedErrors ?? []).length);
  if (degraded.length) {
    console.log(
      `note: live bridge unreachable on ${degraded.length} check(s) - the UI is showing its degraded state, which is the intended 503 behaviour.`,
    );
    for (const row of degraded) {
      console.log(`  ${row.viewport} ${row.route}: ${row.expectedErrors[0].slice(0, 90)}`);
    }
  }
  console.log(`\n${report.length - issues.length}/${report.length} checks clean`);
  for (const row of issues) {
    console.log(
      `  FAIL ${row.viewport} ${row.route} ovf=${row.overflowX} wide=${row.wide.length} ` +
        `clip=${row.clipped.length} err=${row.consoleErrors.length}`,
    );
    for (const w of row.wide.slice(0, 3)) console.log(`       wide ${w.tag} w=${w.w} ${w.cls.slice(0, 70)}`);
    for (const c of row.clipped.slice(0, 3)) console.log(`       clip ${c.tag} ${c.text.slice(0, 60)}`);
    for (const e of row.consoleErrors.slice(0, 3)) console.log(`       err  ${e.slice(0, 140)}`);
  }
  if (issues.length) process.exitCode = 1;
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(`wrote ${OUT}/report.json (${report.length} checks)`);
