import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { hottestAgent, meanLatency, meanUptime } from "../lib/data/mesh-metrics.ts";

/**
 * The live collector reports `null` for anything it could not measure, and the
 * mesh has nineteen profiles that are currently stopped. Every roll-up here has
 * to stay honest under that input: a `0ms` or `0%` printed from a mesh nobody
 * measured is a fabricated number, and `null` renders as an em dash.
 */
describe("roll-ups over unmeasured metrics", () => {
  test("mean latency needs every hop measured", () => {
    assert.equal(meanLatency([{ latencyMs: 10 }, { latencyMs: 20 }]), 15);
    assert.equal(
      meanLatency([{ latencyMs: 10 }, { latencyMs: null }]),
      null,
      "one missing hop must not average into a confident number",
    );
    assert.equal(meanLatency([{ latencyMs: null }]), null);
    assert.equal(meanLatency([]), null);
  });

  test("a partially measured mesh is not a healthy mesh", () => {
    assert.equal(meanUptime([{ uptimePct: 100 }, { uptimePct: null }]), null);
    assert.equal(meanUptime([{ uptimePct: 99 }, { uptimePct: 98 }]), 98.5);
    assert.equal(meanUptime([]), null);
  });

  test("the hottest agent is picked by load", () => {
    const hottest = hottestAgent([
      { id: "a", load: 10 },
      { id: "b", load: 91 },
      { id: "c", load: 40 },
    ]);
    assert.deepEqual(hottest, { id: "b", load: 91 });
  });

  test("no load measured means no hottest agent is named", () => {
    // The bug this pins: sorting an all-null list still returns its first
    // element, so the badge used to read "hottest: frontend · —".
    const allNull = [
      { id: "frontend", load: null },
      { id: "backend", load: null },
      { id: "default", load: null },
    ];
    assert.equal(hottestAgent(allNull), null);
  });

  test("a stopped agent cannot be the hottest", () => {
    const hottest = hottestAgent([
      { id: "stopped", load: null },
      { id: "live", load: 12 },
    ]);
    assert.deepEqual(hottest, { id: "live", load: 12 });
  });

  test("a zero load is a measurement, not a gap", () => {
    const hottest = hottestAgent([
      { id: "idle", load: 0 },
      { id: "unknown", load: null },
    ]);
    assert.deepEqual(
      hottest,
      { id: "idle", load: 0 },
      "0% load is a real reading and must win over an unmeasured agent",
    );
  });

  test("an empty mesh has nothing to report", () => {
    assert.equal(hottestAgent([]), null);
    assert.equal(meanLatency([]), null);
    assert.equal(meanUptime([]), null);
  });
});
