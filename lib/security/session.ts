import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HttpOnly session cookie for the write-capable endpoints.
 *
 * The API token must never reach browser JavaScript, so the operator pastes it
 * once into a login form and the server hands back a signed cookie instead. The
 * cookie is HttpOnly, SameSite=Strict and scoped to a single path, and its value
 * carries no secret: only an HMAC over a nonce, keyed by the API token.
 */

const API_TOKEN = process.env.ANIM_API_TOKEN?.trim() ?? "";
const COOKIE_NAME = "anim_session";
const MAX_AGE_SEC = 60 * 60 * 12;

function secret(): Buffer {
  // Keyed by the configured token so a cookie is useless without it. When no
  // token is configured there is no session to issue.
  return Buffer.from(API_TOKEN, "utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function sessionEnabled(): boolean {
  return API_TOKEN.length > 0;
}

/**
 * Verify a submitted token against the configured one.
 *
 * Without this the login route would mint a valid session for any non-empty
 * string, which is a complete auth bypass.
 */
export function tokenIsValid(candidate: string): boolean {
  if (!API_TOKEN || !candidate) return false;
  return safeEqual(candidate, API_TOKEN);
}

export function issueSession(): string {
  const nonce = `${Date.now().toString(36)}.${createHmac("sha256", secret())
    .update(String(Math.random()))
    .digest("base64url")
    .slice(0, 12)}`;
  return `${Buffer.from(nonce, "utf8").toString("base64url")}.${sign(nonce)}`;
}

export function verifySession(cookie: string | undefined): boolean {
  if (!API_TOKEN || !cookie) return false;
  const [encoded, signature] = cookie.split(".");
  if (!encoded || !signature) return false;
  let nonce: string;
  try {
    nonce = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return false;
  }
  return safeEqual(sign(nonce), signature);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api",
    maxAge: MAX_AGE_SEC,
  };
}

export const SESSION_COOKIE = COOKIE_NAME;
