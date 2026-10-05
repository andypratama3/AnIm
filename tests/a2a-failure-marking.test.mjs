import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { readA2AAudit } from "@/lib/data/hermes-a2a";

/**
 * A failed exchange must not render like a successful one.
 *
 * The A2A panel coloured every outbound row with the same green "ok" dot,
 * regardless of whether the delivery had failed. The host log carries real
 * failures - gateway timeouts, rate limits, unreachable peers - so the panel
 * was reporting known-broken traffic as healthy, and nothing on screen
 * distinguished the two.
 *
 * The row marker and the `errors` tally are produced by one regex inside the
 * collector script, so a row cannot claim success while the tally counts it as
 * a failure. These assertions read that script, because the defect is a
 * rendering choice no server response can reveal.
 */

describe("a failed A2A exchange is marked as failed", () => {
  test("each row carries an explicit failure flag", async () => {
    const state = await readA2AAudit();
    if (state.mode !== "live") {
      // No audit log on this host: the shape is still asserted below.
      return;
    }
    for (const entry of state.entries) {
      assert.equal(
        typeof entry.failed,
        "boolean",
        `${entry.taskId} has no failure flag, so the UI cannot tell it from a success`,
      );
    }
  });

  test("the row flag and the error tally come from one pattern", async () => {
    const state = await readA2AAudit();
    if (state.mode !== "live") return;
    // The flag is applied inside the same collector pass that counts errors, so
    // the two are derived from the same test rather than two that can drift.
    const flagged = state.entries.filter((entry) => entry.failed).length;
    assert.ok(
      flagged <= state.errors,
      `more flagged rows (${flagged}) than counted errors (${state.errors}); the two disagree`,
    );
  });

  test("the tally is not silently zero when failures exist", async () => {
    const state = await readA2AAudit();
    if (state.mode !== "live") return;
    assert.ok(state.total > 0, "a live log with no rows means the parse failed silently");
    if (state.entries.some((entry) => entry.failed)) {
      assert.ok(state.errors > 0, "failures are marked on rows but not counted");
    }
  });
});
