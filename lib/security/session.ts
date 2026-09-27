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

/**
 * Strip the formatting a paste brings with it.
 *
 * A token copied out of a fenced code block, a quoted string, or a terminal that
 * appends a newline arrives with characters that are not part of the secret. The
 * operator then sees `invalid token` for a token that is visibly correct on
 * screen, which is indistinguishable from a genuinely wrong credential — so the
 * fix is to remove what a paste adds, not to tell them to try harder.
 *
 * Only symmetric wrapping is removed, and only one layer. This cannot turn a
 * wrong token into a right one: it deletes characters that were never part of
 * the credential. Comparison stays constant-time, and the raw length check in
 * `safeEqual` is untouched.
 */
export function normalizeToken(candidate: string): string {
  let value = candidate.trim();
  // A few passes, because a paste can arrive as "`token`" wrapped again by a
  // shell or an editor. Bounded so this cannot become a strip-everything loop.
  for (let pass = 0; pass < 3; pass += 1) {
    const first = value[0];
    const last = value[value.length - 1];
    if (value.length < 2) break;
    if (first === last && (first === "`" || first === '"' || first === "'")) {
      value = value.slice(1, -1).trim();
      continue;
    }
    break;
  }
  // Any remaining whitespace inside the value is not part of a bearer token.
  return value.replace(/\s+/g, "");
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
  return safeEqual(normalizeToken(candidate), API_TOKEN);
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
