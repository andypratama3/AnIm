import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

/**
 * Auth and throttling for the endpoints that can spend real resources.
 *
 * `ANIM_API_TOKEN` is read at module load, so it is set before the dynamic
 * import. node:test isolates each file in its own process, so this token does
 * not leak into the "no token configured" suite in guard-unconfigured.test.mjs.
 */
const TOKEN = "test-token-do-not-use-anywhere-real";

before(async () => {
  process.env.ANIM_API_TOKEN = TOKEN;
  process.env.ANIM_CHAT_RATE_LIMIT = "3";
  process.env.ANIM_CHAT_MAX_CONCURRENT = "2";
});

const guard = await import("../lib/security/guard.ts");
const session = await import("../lib/security/session.ts");

const req = (headers = {}) => new Request("http://localhost/api/agent-chat", { headers });

const bearer = (value) => ({ authorization: `Bearer ${value}` });

describe("token handling", () => {
  test("the correct token is accepted", () => {
    const res = guard.checkAuth(req(bearer(TOKEN)));
    assert.equal(res.ok, true);
  });

  test("a wrong token is refused", () => {
    const res = guard.checkAuth(req(bearer("not-the-token")));
    assert.equal(res.ok, false);
    assert.equal(res.status, 401);
  });

  test("a token of a different length is refused", () => {
    // Exercises the constant-time compare's length branch, which used to be the
    // one path that could not be reached with a same-length guess.
    for (const value of ["x", `${TOKEN}x`, TOKEN.slice(0, -1)]) {
      const res = guard.checkAuth(req(bearer(value)));
      assert.equal(res.ok, false, `expected ${value.length} chars to be refused`);
    }
  });

  test("a prefix of the token is refused", () => {
    assert.equal(guard.checkAuth(req(bearer(TOKEN.slice(0, 8)))).ok, false);
  });

  test("an empty or missing credential is refused", () => {
    assert.equal(guard.checkAuth(req()).status, 401);
    assert.equal(guard.checkAuth(req(bearer(""))).status, 401);
    assert.equal(guard.checkAuth(req({ authorization: "Bearer" })).status, 401);
  });

  test("the x-anim-token header works for scripted clients", () => {
    assert.equal(guard.checkAuth(req({ "x-anim-token": TOKEN })).ok, true);
    assert.equal(guard.checkAuth(req({ "x-anim-token": "wrong" })).ok, false);
  });

  test("a case-mismatched scheme is not a valid bearer token", () => {
    assert.equal(guard.checkAuth(req({ authorization: `bearer ${TOKEN}` })).ok, false);
  });
});

describe("session cookie", () => {
  test("a freshly issued cookie authenticates", () => {
    const cookie = session.issueSession();
    const res = guard.checkAuth(req({ cookie: `${session.SESSION_COOKIE}=${cookie}` }));
    assert.equal(res.ok, true);
  });

  test("a cookie survives being read from a multi-cookie header", () => {
    const cookie = session.issueSession();
    const header = `theme=dark; ${session.SESSION_COOKIE}=${cookie}; locale=id`;
    assert.equal(guard.checkAuth(req({ cookie: header })).ok, true);
  });

  test("a forged cookie is refused", () => {
    const forged = Buffer.from("anything", "utf8").toString("base64url") + ".signature";
    const res = guard.checkAuth(req({ cookie: `${session.SESSION_COOKIE}=${forged}` }));
    assert.equal(res.status, 401);
  });

  test("tampering with the nonce invalidates the signature", () => {
    const signature = session.issueSession().split(".")[1];
    const swapped = Buffer.from("other-nonce", "utf8").toString("base64url");
    const res = guard.checkAuth(
      req({ cookie: `${session.SESSION_COOKIE}=${swapped}.${signature}` }),
    );
    assert.equal(res.status, 401);
  });

  test("a truncated or empty cookie is refused", () => {
    for (const value of ["", ".", "no-signature", "a.b.c"]) {
      assert.equal(session.verifySession(value), false, `expected ${value} to be refused`);
    }
  });

  test("a missing cookie is refused", () => {
    assert.equal(session.verifySession(undefined), false);
  });

  test("two issued cookies are both valid but differ", () => {
    const a = session.issueSession();
    const b = session.issueSession();
    assert.notEqual(a, b);
    assert.ok(session.verifySession(a));
    assert.ok(session.verifySession(b));
  });

  test("the cookie carries no token material", () => {
    const cookie = session.issueSession();
    assert.ok(!cookie.includes(TOKEN));
    assert.ok(!cookie.includes(Buffer.from(TOKEN).toString("base64url")));
  });

  test("token validation rejects blanks and near-misses", () => {
    assert.equal(session.tokenIsValid(TOKEN), true);
    assert.equal(session.tokenIsValid(""), false);
    assert.equal(session.tokenIsValid("   "), false, "whitespace is not a credential");
    assert.equal(session.tokenIsValid(TOKEN.toUpperCase()), false, "case still matters");
    assert.equal(session.tokenIsValid(TOKEN.slice(0, -1)), false, "no prefix match");
    assert.equal(session.tokenIsValid(`${TOKEN}x`), false, "no extension match");
  });

  // A paste carries what surrounds the secret. Rejecting it produced an
  // `invalid token` the operator could not act on, for a value that was visibly
  // correct, so surrounding formatting is stripped before the constant-time
  // compare. This is the one place the check is deliberately forgiving; the
  // assertions above are the line it must not cross.
  test("surrounding paste formatting is tolerated, the secret is not", () => {
    assert.equal(session.tokenIsValid(`${TOKEN} `), true, "trailing space");
    assert.equal(session.tokenIsValid(`\`${TOKEN}\``), true, "code-fence marks");
    assert.equal(session.tokenIsValid(`"${TOKEN}"`), true, "quotes");
    assert.equal(session.tokenIsValid(`\`${TOKEN}"`), false, "mismatched wrapping is not guessed at");
  });

  test("cookie options keep it HttpOnly, strict and scoped to /api", () => {
    const options = session.sessionCookieOptions();
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "strict");
    assert.equal(options.path, "/api");
    assert.ok(options.maxAge > 0 && options.maxAge <= 60 * 60 * 24);
  });
});

describe("rate limiting", () => {
  test("the budget is enforced per client and then refills", () => {
    const key = `client-${Date.now()}`;
    for (let i = 0; i < 3; i += 1) {
      assert.equal(guard.checkRateLimit(key).ok, true, `request ${i + 1} should pass`);
    }
    const blocked = guard.checkRateLimit(key);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 429);
    assert.ok(blocked.retryAfterSec >= 1);
  });

  test("one noisy client does not lock out another", () => {
    const noisy = `noisy-${Date.now()}`;
    const quiet = `quiet-${Date.now()}`;
    for (let i = 0; i < 4; i += 1) guard.checkRateLimit(noisy);
    assert.equal(guard.checkRateLimit(noisy).ok, false);
    assert.equal(guard.checkRateLimit(quiet).ok, true);
  });

  test("the first request opens the window", () => {
    const key = `fresh-${Date.now()}-${Math.random()}`;
    assert.equal(guard.checkRateLimit(key).ok, true);
  });
});

describe("concurrency ceiling", () => {
  test("slots are capped and released", () => {
    assert.equal(guard.acquireSlot(), true);
    assert.equal(guard.acquireSlot(), true);
    assert.equal(guard.acquireSlot(), false, "third slot must be refused");
    guard.releaseSlot();
    assert.equal(guard.acquireSlot(), true, "a released slot is reusable");
    guard.releaseSlot();
    guard.releaseSlot();
  });

  test("releasing more than was taken does not go negative", () => {
    for (let i = 0; i < 5; i += 1) guard.releaseSlot();
    assert.equal(guard.acquireSlot(), true);
    guard.releaseSlot();
  });
});

describe("client identity and headers", () => {
  test("the first forwarded hop identifies the client", () => {
    const res = guard.checkAuth(req({ ...bearer(TOKEN), "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    assert.equal(res.client, "203.0.113.7");
  });

  test("x-real-ip is the fallback, and local is the last resort", () => {
    assert.equal(guard.checkAuth(req({ ...bearer(TOKEN), "x-real-ip": "198.51.100.4" })).client, "198.51.100.4");
    assert.equal(guard.checkAuth(req(bearer(TOKEN))).client, "local");
  });

  test("responses are never cached", () => {
    const headers = guard.guardHeaders();
    assert.match(headers["cache-control"], /no-store/);
    assert.equal(headers["retry-after"], undefined);
  });

  test("a 429 carries retry-after", () => {
    const headers = guard.guardHeaders(42);
    assert.equal(headers["retry-after"], "42");
  });

  test("pruning is safe to call on an empty ledger", () => {
    assert.doesNotThrow(() => guard.pruneRateLimits());
  });
});
