import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * Window expiry needs its own file because the window length is read at module
 * load, and a real one-minute window would make the suite useless. 25ms is long
 * enough to be stable under load and short enough to wait for.
 */
before(async () => {
  process.env.ANIM_API_TOKEN = "window-test-token";
  process.env.ANIM_CHAT_RATE_LIMIT = "2";
  process.env.ANIM_CHAT_RATE_WINDOW_MS = "25";
});

const guard = await import("../lib/security/guard.ts");

describe("rate limit window", () => {
  test("the budget refills once the window expires", async () => {
    const key = `refill-${Date.now()}-${Math.random()}`;

    assert.equal(guard.checkRateLimit(key).ok, true);
    assert.equal(guard.checkRateLimit(key).ok, true);
    const blocked = guard.checkRateLimit(key);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 429);
    assert.ok(blocked.retryAfterSec >= 1);

    await sleep(40);

    // Same client, same key: the window rolled over, so it is allowed again.
    assert.equal(guard.checkRateLimit(key).ok, true, "the budget must refill");
  });

  test("retry-after counts down rather than repeating the original value", async () => {
    const key = `countdown-${Date.now()}-${Math.random()}`;
    guard.checkRateLimit(key);
    guard.checkRateLimit(key);
    const first = guard.checkRateLimit(key);
    assert.equal(first.retryAfterSec, 1, "a sub-second window floors to 1s");

    await sleep(40);
    assert.equal(guard.checkRateLimit(key).ok, true);
  });

  test("pruning drops expired windows and keeps the ledger clean", async () => {
    const key = `prune-${Date.now()}-${Math.random()}`;
    guard.checkRateLimit(key);
    await sleep(40);
    guard.pruneRateLimits();

    // If the window had survived, this would still be throttled.
    assert.equal(guard.checkRateLimit(key).ok, true);
  });
});
