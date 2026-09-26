import { timingSafeEqual } from "node:crypto";

import { SESSION_COOKIE, sessionEnabled, verifySession } from "@/lib/security/session";

/**
 * Guards for endpoints that can spend real resources.
 *
 * `/api/agent-chat` is the motivating case: one request spawns a remote Hermes
 * process that can run for minutes. Without these guards a single unauthenticated
 * caller can fan out dozens of concurrent remote processes, so auth, a per-client
 * rate limit, and a global concurrency ceiling are all required before the
 * endpoint may be exposed.
 */

const API_TOKEN = process.env.ANIM_API_TOKEN?.trim() ?? "";
/**
 * Read-only dashboards (`/api/mesh`, `/api/mesh-live`) stay open on purpose:
 * they expose no secrets and the UI has no session. Anything that can *act* on
 * the mesh must present the token.
 */
const REQUIRE_AUTH = sessionEnabled();

/**
 * A write-capable endpoint with no token configured is an open door. That is a
 * reasonable convenience on a laptop, and a serious hole on a shared host, so
 * production refuses to serve rather than defaulting to open. The failure is
 * loud on purpose: a misconfigured deploy should be obvious, not silently
 * permissive.
 */
export function authMisconfigured(): boolean {
  return !sessionEnabled() && process.env.NODE_ENV === "production";
}

const RATE_LIMIT = Number(process.env.ANIM_CHAT_RATE_LIMIT ?? 6);
const RATE_WINDOW_MS = Number(process.env.ANIM_CHAT_RATE_WINDOW_MS ?? 60_000);
/** Ceiling on simultaneous remote agent processes. */
const MAX_CONCURRENT = Number(process.env.ANIM_CHAT_MAX_CONCURRENT ?? 2);

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "local";
}

/**
 * Reject state-changing requests that arrive from another origin.
 *
 * The session cookie is `SameSite=Strict`, which already blocks the common
 * cross-site POST, so this is defence in depth rather than the only barrier: a
 * browser that sends an `Origin` we do not recognise is not our own page, and
 * scripted clients (curl, CI) send no `Origin` at all and are unaffected.
 */
export function checkOrigin(request: Request): GuardResult {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { ok: true, client: clientKey(request) };
  }

  const origin = request.headers.get("origin");
  if (!origin) return { ok: true, client: clientKey(request) };

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (!host) return { ok: true, client: clientKey(request) };

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return { ok: false, status: 403, error: "malformed origin" };
  }

  const allowed = host.split(",")[0]?.trim() === originHost;
  if (!allowed) {
    return { ok: false, status: 403, error: "cross-origin request refused" };
  }
  return { ok: true, client: clientKey(request) };
}

/** Constant-time compare that does not leak length via early return. */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still perform a compare so the branch cost does not reveal the length.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export type GuardResult =
  | { ok: true; client: string }
  | {
      ok: false;
      status: number;
      error: string;
      retryAfterSec?: number;
      /**
       * Machine-readable reason, so the client can tell a genuine refusal from
       * a misconfigured server. Both can be 503, so matching on the status alone
       * would show "sign in again" for a deployment that has no token to sign in
       * with.
       */
      code?: string;
    };

export function checkAuth(request: Request): GuardResult {
  if (authMisconfigured()) {
    return {
      ok: false,
      status: 503,
      error: "ANIM_API_TOKEN is not set; refusing to serve write endpoints",
      code: "auth_misconfigured",
    };
  }

  if (!REQUIRE_AUTH) {
    // No token configured outside production: the endpoint stays reachable for
    // local development. Production is handled above and fails closed.
    return { ok: true, client: clientKey(request) };
  }

  const client = clientKey(request);

  // A browser session cookie is the normal path: the operator pasted the token
  // once at login, so nothing sensitive is ever present in page JavaScript.
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (verifySession(cookie)) return { ok: true, client };

  // Header auth stays available for scripted clients (curl, CI).
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const provided = bearer || request.headers.get("x-anim-token")?.trim() || "";
  if (provided && tokenMatches(provided, API_TOKEN)) return { ok: true, client };

  return { ok: false, status: 401, error: "sign in required" };
}

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

export function checkRateLimit(key: string): GuardResult {
  const now = Date.now();
  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true, client: key };
  }
  existing.count += 1;
  if (existing.count > RATE_LIMIT) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { ok: false, status: 429, error: "rate limit exceeded", retryAfterSec };
  }
  return { ok: true, client: key };
}

let active = 0;
export function acquireSlot(): boolean {
  if (active >= MAX_CONCURRENT) return false;
  active += 1;
  return true;
}
export function releaseSlot(): void {
  active = Math.max(0, active - 1);
}

/** Drops expired rate-limit windows so a long-lived process cannot leak memory. */
export function pruneRateLimits(): void {
  const now = Date.now();
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export function guardHeaders(retryAfterSec?: number): Record<string, string> {
  return {
    "cache-control": "no-store, max-age=0",
    ...(retryAfterSec ? { "retry-after": String(retryAfterSec) } : {}),
  };
}
