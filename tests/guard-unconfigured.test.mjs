import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

/**
 * The local-development path: with no `ANIM_API_TOKEN` configured there is no
 * session to issue and no credential to check, so the write endpoints stay
 * reachable for a trusted machine. This suite exists because that fallback is
 * the difference between "convenient locally" and "open on a public host", and
 * it needs to fail loudly if the behaviour ever changes.
 */
before(async () => {
  delete process.env.ANIM_API_TOKEN;
});

const guard = await import("../lib/security/guard.ts");
const session = await import("../lib/security/session.ts");

describe("unconfigured deployment", () => {
  test("sessions are reported as disabled", () => {
    assert.equal(session.sessionEnabled(), false);
  });

  test("no token can ever validate when none is configured", () => {
    assert.equal(session.tokenIsValid("anything"), false);
    assert.equal(session.tokenIsValid(""), false);
  });

  test("an issued cookie does not verify without a configured token", () => {
    // The HMAC is keyed by the token, so with no key there is nothing to trust.
    assert.equal(session.verifySession(session.issueSession()), false);
  });

  test("auth passes through for local use", () => {
    const res = guard.checkAuth(new Request("http://localhost/api/agent-chat"));
    assert.equal(res.ok, true);
  });

  test("the throttle still applies even without auth", () => {
    const key = `local-${Date.now()}-${Math.random()}`;
    let refused = false;
    for (let i = 0; i < 40; i += 1) {
      if (guard.checkRateLimit(key).ok === false) {
        refused = true;
        break;
      }
    }
    assert.ok(refused, "an unauthenticated loop must still hit the rate limit");
  });

  test("the concurrency ceiling still applies without a token", () => {
    let granted = 0;
    while (guard.acquireSlot()) granted += 1;
    assert.ok(granted > 0, "the first slots are granted");
    assert.ok(granted < 40, `the ceiling must bind, granted ${granted}`);
    for (let i = 0; i < granted; i += 1) guard.releaseSlot();
  });
});
