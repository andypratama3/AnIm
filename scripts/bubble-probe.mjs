/**
 * Measure the rendered chat thread, so styling decisions are made against
 * computed styles rather than guesses about what a class name implies.
 *
 * Reports, for the outgoing and incoming bubbles: fill, text colour, computed
 * contrast ratio, border radius per corner, padding, max width, and the gap
 * between a run of messages from the same sender.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signIn } from "./ui-audit.mjs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CDP_PORT ?? 9444);

function resolveChrome() {
  for (const p of ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
    try {
      readFileSync(p);
      return p;
    } catch {}
  }
  throw new Error("no chrome binary found");
}

function token() {
  const fromEnv = process.env.ANIM_API_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return readFileSync(join(REPO, ".env.local"), "utf8").match(/^ANIM_API_TOKEN=(.*)$/m)?.[1]?.trim() ?? "";
}

const PROBE = `(() => {
  // Computed colours come back as oklab() here, which no regex can decompose.
  // Paint the colour into a 1x1 canvas and read the pixel back: that resolves
  // any CSS colour notation to real sRGB without a colour library.
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  const parse = (str) => {
    if (!str || str === 'transparent' || str === 'none') return null;
    if (cache.has(str)) return cache.get(str);
    cx.clearRect(0,0,1,1);
    cx.fillStyle = '#000';
    cx.fillStyle = str;
    const resolved = cx.fillStyle;              // canvas normalises what it can
    cx.clearRect(0,0,1,1);
    cx.fillStyle = str; cx.fillRect(0,0,1,1);
    const d = cx.getImageData(0,0,1,1).data;
    const out = [d[0], d[1], d[2], d[3] / 255];
    if (resolved !== str && resolved) { /* normalised form, still painted below */ }
    cache.set(str, out);
    return out;
  };
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const lum = ([r,g,b]) => 0.2126*srgb(r) + 0.7152*srgb(g) + 0.0722*srgb(b);
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg);
    const [hi,lo] = a > b ? [a,b] : [b,a]; return (hi+0.05)/(lo+0.05); };
  const bgOf = (el) => { let n = el;
    while (n && n !== document.documentElement) { const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.5) return c; n = n.parentElement; }
    return [255,255,255,1]; };

  const out = { thread: null, outgoing: [], incoming: [], overflowX: null, bubbleCount: 0 };
  // A bubble is identified by its *computed* shape, not by a class name. The
  // geometry moved to a four-value radius shorthand, so anchoring on a utility
  // name here would silently find nothing the moment the CSS changes.
  const bubbles = [...document.querySelectorAll("div")].filter((el) => {
    const cs = getComputedStyle(el);
    const tailRight = cs.borderBottomRightRadius !== cs.borderTopRightRadius;
    const tailLeft = cs.borderBottomLeftRadius !== cs.borderTopLeftRadius;
    if (!tailRight && !tailLeft) return false;
    // Skip the thread panel and other wrappers: a bubble holds message text and
    // paints its own background.
    const bg = parse(cs.backgroundColor);
    return !!bg && bg[3] > 0.5 && (el.textContent || "").trim().length > 0;
  });
  out.bubbleCount = bubbles.length;

  const scroller = bubbles.length
    ? bubbles[0].closest('[class*="overflow-y-auto"]')
    : null;
  if (scroller) {
    const cs = getComputedStyle(scroller);
    out.thread = { maxH: cs.maxHeight, minH: cs.minHeight, overflowY: cs.overflowY,
                   scrollH: scroller.scrollHeight, clientH: scroller.clientHeight,
                   w: Math.round(scroller.clientWidth) };
    out.overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  }

  for (const el of bubbles) {
    const cs = getComputedStyle(el);
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    const rect = el.getBoundingClientRect();
    // The tail is the corner that differs from the opposite one.
    const mine = cs.borderBottomRightRadius !== cs.borderTopRightRadius;
    out[mine ? 'outgoing' : 'incoming'].push({
      w: Math.round(rect.width), h: Math.round(rect.height),
      radius: cs.borderRadius,
      pad: cs.padding, maxW: cs.maxWidth,
      fg: "rgb(" + fg.slice(0,3).join(",") + ")",
      bg: "rgb(" + bg.slice(0,3).join(",") + ")",
      contrast: Math.round(ratio(fg.slice(0,3), bg.slice(0,3))*100)/100,
    });
  }
  out.outgoing = out.outgoing.slice(0,2);
  out.incoming = out.incoming.slice(0,2);
  return out;
})()`;

const chrome = spawn(resolveChrome(), [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--no-sandbox",
  "--disable-gpu", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpTargets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome did not expose a debugging target");
}

const url = await cdpTargets();
const ws = new WebSocket(url);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

const sessionId = (await send("Target.createTarget", { url: "about:blank" })).result.targetId;
await send("Target.attachToTarget", { targetId: sessionId, flatten: true });
const call = (m, p = {}) => send(m, p).then((r) => r.result);

await call("Page.enable");
await call("Runtime.enable");
await call("Network.enable");
await call("Emulation.setDeviceMetricsOverride", { width: 1512, height: 950, deviceScaleFactor: 1, mobile: false });

const session = await signIn(BASE, token());
if (session) await call("Network.setCookie", { name: "anim_session", value: session, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict" });

await call("Page.navigate", { url: `${BASE}/discussion` });
await sleep(6000);
const probe = await call("Runtime.evaluate", { expression: PROBE, returnByValue: true });
console.log(JSON.stringify(probe.result.value, null, 2));

ws.close();
chrome.kill();
process.exit(0);
