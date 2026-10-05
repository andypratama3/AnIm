import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildSeries, windowTotals } from "@/lib/data/history-store";

/**
 * Latency figures must describe the population their label claims.
 *
 * The window reported `p95 45ms` next to `avg 919ms`. A p95 below its own mean
 * is not a slow tail, it is two different metrics sharing one name: the average
 * was taken over `collectMs` - the cost of sweeping every profile - while the
 * p95 was taken over per-agent gateway round trips. On the chart the same split
 * put the p95 overlay an order of magnitude below the line it was meant to
 * bound, so the tail looked impossibly fast.
 *
 * `collectMs` is a genuine measurement, so it is not discarded; it is reported
 * separately, because it measures this console's sampler and not an agent.
 */

const sample = (over = {}) => ({
  ts: Date.now(),
  collectMs: 900,
  online: 7,
  degraded: 0,
  offline: 19,
  links: 21,
  probes: { default: 24, backend: 3, frontend: 3 },
  a2aTotal: 100,
  a2aErrors: 0,
  ...over,
});

const WINDOW = 30 * 60 * 1000;

describe("latency is reported over one population, not two", () => {
  test("p95 is never below the mean it is quoted beside", () => {
    const totals = windowTotals([sample()], WINDOW);
    assert.ok(totals.avgLatency !== null && totals.p95Latency !== null);
    assert.ok(
      totals.p95Latency >= totals.avgLatency,
      `p95 ${totals.p95Latency} is below mean ${totals.avgLatency}`,
    );
  });

  test("the average tracks agent probes, not the collector sweep", () => {
    // collectMs is 900; the probes average 10. Reporting 900 as "agent latency"
    // is what produced the impossible pair.
    const totals = windowTotals([sample()], WINDOW);
    assert.equal(Math.round(totals.avgLatency), 10);
  });

  test("the collector sweep is still measured, under its own name", () => {
    const totals = windowTotals([sample()], WINDOW);
    assert.equal(totals.collectMs, 900);
  });

  test("an empty window measures nothing rather than reporting zero", () => {
    const totals = windowTotals([], WINDOW);
    assert.deepEqual(totals, {
      avgLatency: null,
      p95Latency: null,
      successRate: null,
      collectMs: null,
    });
  });

  test("a sample with no probe timings leaves latency unmeasured", () => {
    // Offline gateways have nothing to time. Averaging an empty list would
    // print a confident 0ms latency for every unreachable agent.
    const totals = windowTotals([sample({ probes: {} })], WINDOW);
    assert.equal(totals.avgLatency, null);
    assert.equal(totals.p95Latency, null);
    assert.equal(totals.collectMs, 900);
  });

  test("the charted latency line and its p95 overlay bound the same series", () => {
    const samples = [
      sample({ ts: Date.now() - 60_000, probes: { a: 5, b: 5, c: 5 } }),
      sample({ ts: Date.now(), probes: { a: 400, b: 3, c: 3 } }),
    ];
    const series = buildSeries(samples, WINDOW, 30);
    assert.ok(series.labels.length > 0);
    series.latency.forEach((mean, i) => {
      const p95 = series.p95[i];
      if (p95 == null) return;
      assert.ok(
        p95 >= mean,
        `bucket ${i}: p95 ${p95} below the mean line ${mean} it overlays`,
      );
    });
  });

  test("the collector sweep is not plotted as agent latency", () => {
    const samples = [sample({ ts: Date.now() - 60_000 }), sample({ ts: Date.now() })];
    const series = buildSeries(samples, WINDOW, 30);
    // Every sample has a 900ms sweep and ~10ms probes; the latency line must
    // follow the probes.
    series.latency.forEach((value, i) => {
      assert.ok(value < 100, `bucket ${i} plotted the ${value}ms collector sweep as latency`);
    });
    series.collectMs.forEach((value, i) => {
      assert.ok(value > 100, `bucket ${i} lost the collector sweep reading`);
    });
  });
});
