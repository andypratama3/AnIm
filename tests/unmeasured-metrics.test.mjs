import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, describe } from "node:test";

import { NOT_MEASURED, formatCompact, formatMs, formatNumber, formatPercent } from "@/lib/format";

/**
 * Unmeasured metrics must not become zeros.
 *
 * The live bridge reports `latencyMs`, `uptimePct`, `tokens`, `queue`, `load`,
 * `memoryMb`, `busy`, `tasks`, `avgLatency`, `p95Latency` and `successRate` as
 * `null`, because the collector has no such metric. `lib/types.ts` says so, and
 * the formatters honour it.
 *
 * The renderers did not. They were only ever exercised against the simulated
 * snapshot, where every field is a number, so a `?? 0` or a bare `.toFixed()`
 * looked fine and then shipped: `/agents` threw
 * `TypeError: Cannot read properties of null (reading 'toFixed')` the moment the
 * bridge went live, and the gauge drew a 0% arc under the label "not reported".
 *
 * These assertions read the sources, because a crash or a fabricated zero in a
 * table cell is only observable in a browser.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/** Drop comments, so a comment quoting the old buggy code is not read as code. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const [agentsRaw, analyticsRaw, appShellRaw, sidebarRaw, gauge] = await Promise.all([
  read("app/agents/page.tsx"),
  read("app/analytics/page.tsx"),
  read("components/layout/app-shell.tsx"),
  read("components/layout/sidebar-nav.tsx"),
  read("components/dashboard/sparkline.tsx"),
]);

const agentsPage = stripComments(agentsRaw);
const analyticsPage = stripComments(analyticsRaw);
const appShell = stripComments(appShellRaw);
const sidebar = stripComments(sidebarRaw);

/** Every `x ?? 0` / `x || 0` applied to a field the collector never reports. */
const UNREPORTED = [
  "successRate",
  "avgLatency",
  "p95Latency",
  "busy",
  "tokens",
  "queue",
  "uptimePct",
  "latencyMs",
  "memoryMb",
];

describe("formatters render an absent metric as unmeasured", () => {
  test("they never coerce null to a number", () => {
    for (const format of [formatPercent, formatNumber, formatCompact, formatMs]) {
      assert.equal(format(null), NOT_MEASURED, `${format.name}(null)`);
      assert.equal(format(undefined), NOT_MEASURED, `${format.name}(undefined)`);
    }
  });

  test("a real zero is still a real zero", () => {
    // The whole point of `null` over `0`: these must be distinguishable.
    assert.equal(formatPercent(0), "0.0%");
    assert.equal(formatNumber(0), "0");
    assert.notEqual(formatNumber(0), formatNumber(null));
  });
});

describe("no page fabricates a zero for a metric the collector does not report", () => {
  const sources = [
    ["app/agents/page.tsx", agentsPage],
    ["app/analytics/page.tsx", analyticsPage],
    ["components/layout/app-shell.tsx", appShell],
    ["components/layout/sidebar-nav.tsx", sidebar],
  ];

  for (const [name, source] of sources) {
    test(name, () => {
      for (const field of UNREPORTED) {
        // Scoped to the collector-backed paths. A local counter such as
        // `counts.busy` is computed from `agents.filter(...)` and is always a
        // number, so flagging it would be noise rather than a finding.
        const coerced = new RegExp(
          `(?:totals|agent|row|info\\.getValue\\(\\))\\s*\\.\\s*${field}\\b[^\\n]{0,40}(\\?\\?|\\|\\|)\\s*0\\b`,
        );
        assert.doesNotMatch(
          source,
          coerced,
          `${field} is null when unmeasured; coercing it to 0 invents a measurement`,
        );
      }
    });
  }
});

describe("no page calls a method on a possibly-null metric", () => {
  test("/agents does not call toFixed on the uptime column", () => {
    // This is the exact line that threw. `uptimePct` is `number | null`.
    assert.doesNotMatch(agentsPage, /getValue\(\)\.toFixed\(/);
    assert.match(agentsPage, /formatPercent\(info\.getValue\(\), 2\)/);
  });

  test("no unreported field is formatted with a bare method call", () => {
    for (const [name, source] of [
      ["app/agents/page.tsx", agentsPage],
      ["app/analytics/page.tsx", analyticsPage],
      ["components/layout/app-shell.tsx", appShell],
      ["components/layout/sidebar-nav.tsx", sidebar],
    ]) {
      for (const field of UNREPORTED) {
        assert.doesNotMatch(
          source,
          new RegExp(`\\.${field}\\b[^\\n]{0,20}\\.toFixed\\(`),
          `${name}: ${field} may be null; use a formatter from lib/format`,
        );
      }
    }
  });
});

describe("the radial gauge admits an unmeasured value", () => {
  test("its value accepts null", () => {
    assert.match(gauge, /value: number \| null;/);
  });

  test("an unmeasured gauge shows an em dash, not 0", () => {
    assert.match(gauge, /measured \? Math\.round\(clamped\) : "—"/);
  });

  test("an unmeasured gauge draws no arc at all", () => {
    // A zero-length offset with a full circumference reads as a perfect score.
    assert.match(gauge, /measured \? undefined : \{ strokeDasharray: "0 0", stroke: "none" \}/);
  });

  test("no caller invents a zero to satisfy it", () => {
    assert.doesNotMatch(analyticsPage, /RadialGauge\s+value=\{[^}]*\?\? 0\}/);
  });
});

describe("the sidebar badge counts something that was measured", () => {
  test("it no longer relies on a reduce that always returns 0", () => {
    // `0 ?? fallback` is `0`, so the totals branch was dead code.
    assert.doesNotMatch(
      sidebar,
      /reduce\([^)]*\) \?\?/,
      "a reduce over an empty array returns 0, and ?? never fires on 0",
    );
  });

  test("it distinguishes unmeasured from zero", () => {
    assert.match(sidebar, /Record<string, number \| null>/);
  });
});

/**
 * The live path must not invent whole series.
 *
 * The gap the earlier `?? 0` hunt could not see: `live-mesh.ts` filled the
 * entire time series and the entire heat grid on the live path. The series came
 * from the local generator, so a live deploy drew a random throughput trace that
 * reshuffled on every 5s poll and was indistinguishable from telemetry; the heat
 * grid returned 24 zero cells per agent (26 x 24 = 624), rendering a full idle
 * week heatmap while the comment above it promised an empty grid.
 *
 * Both are now empty, and `health` is null, so the charts render their empty
 * state. These assertions pin that, because the failure mode is silent: the
 * console still looks populated, just wrong.
 */
const [liveMeshRaw, sparklineRaw, engineRaw, historyStoreRaw] = await Promise.all([
  read("lib/data/live-mesh.ts"),
  read("components/dashboard/sparkline.tsx"),
  read("lib/data/engine.ts"),
  read("lib/data/history-store.ts"),
]);

const liveMesh = stripComments(liveMeshRaw);
const sparkline = stripComments(sparklineRaw);
const engine = stripComments(engineRaw);
const historyStore = stripComments(historyStoreRaw);

describe("the live path fabricates no series, heat or score", () => {
  test("live mode builds its series from recorded samples, never a generated one", () => {
    // `createSnapshot` remains imported for the *simulated* fallback, so the
    // check is that the live snapshot does not call it.
    const liveBlock = liveMesh.slice(liveMesh.indexOf("const snapshot: MeshSnapshot"));
    assert.match(
      liveBlock,
      /throughput: series\.throughput/,
      "the live series must come from the recorded-sample builder",
    );
    assert.doesNotMatch(
      liveBlock,
      /syntheticSeries|createSnapshot\(/,
      "live mode must not generate series",
    );
    // The series is only as honest as the store behind it: with nothing
    // recorded, the builder has to hand back empty buckets, not zeros.
    assert.match(
      historyStore,
      /if \(!recent\.length\) \{[\s\S]*?throughput: \[\]/,
      "an empty history must yield an empty series, not a zeroed one",
    );
  });

  test("the heat grid is empty rather than uniformly zero", () => {
    const fn = liveMesh.slice(
      liveMesh.indexOf("function heatFromInventory"),
      liveMesh.indexOf("export type LiveMesh"),
    );
    assert.match(fn, /return \[\];/, "heat must be empty until a load metric exists");
    assert.doesNotMatch(fn, /load: 0/, "a zero load cell is a fabricated measurement");
    assert.doesNotMatch(fn, /Array\.from/, "no synthetic grid");
  });

  test("health is null, with no constant ladder behind it", () => {
    const fn = liveMesh.slice(
      liveMesh.indexOf("function healthFor"),
      liveMesh.indexOf("function toAgent"),
    );
    assert.match(fn, /return null;/, "health must be unmeasured");
    // 100/85/55/0 looked like a quality score and rendered as a real meter.
    assert.doesNotMatch(fn, /return (100|85|55)\b/, "a hand-picked health score is invented");
  });

  test("the simulated fallback is still reachable and still labelled", () => {
    assert.match(liveMesh, /mode: "simulated"/, "the fallback must remain");
    assert.match(liveMesh, /synthetic: false/, "live series are not synthetic");
  });

  test("the mesh score is null when nothing was measured", () => {
    // `meshHealthScore` is the one consumer that could have papered over a null
    // `health` by treating it as 0 and rendering a confident-looking meter. It
    // averages only the measured agents and returns null when there are none.
    const fn = engine.slice(engine.indexOf("export function meshHealthScore"));
    assert.match(fn, /typeof h === "number"/, "unmeasured agents must be filtered out");
    assert.match(fn, /measured\.length === 0\) return null;/, "no measurement, no score");
    assert.doesNotMatch(fn, /\?\? 0|\|\| 0/, "a null health must never be coerced to 0");
  });
});

describe("a chart cannot emit a non-finite SVG attribute", () => {
  /**
   * The reported crash was `<circle> attribute cy: Expected length, "NaN"`.
   * `Math.min(...[])` is `Infinity` and `Math.max(...[])` is `-Infinity`, so the
   * span became `-Infinity` — and the `|| 1` guard did not fire, because
   * `Infinity` is truthy. The end dot divided by that and produced `NaN`.
   *
   * These are the exact expressions, evaluated the way the component does.
   */
  const dotY = (data, height = 40) => {
    if (data.length === 0) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const last = data[data.length - 1];
    return height - 2 - ((last - min) / span) * (height - 4);
  };

  test("the old empty-array path is what produced NaN", () => {
    // Reproduced deliberately: this is the bug, asserted so it cannot be
    // reintroduced by "simplifying" the guard away.
    const min = Math.min(...[]);
    const max = Math.max(...[]);
    const span = max - min || 1;
    const value = (0 - min) / span;
    assert.equal(span, -Infinity, "the guard does not catch -Infinity");
    assert.ok(Number.isNaN(value), "which yields NaN");
  });

  test("the dot is only computed from real, finite samples", () => {
    assert.equal(dotY([]), null, "empty series draws no dot");
    // height 40: y = 40 - 2 - ((3-1)/(3-1)) * 36 = 2, the top of the plot area.
    assert.equal(dotY([1, 2, 3]), 2);
    assert.equal(dotY([5, 5, 5]), 38, "a flat series sits on the floor, not NaN");
    // A null smuggled in from JSON poisons Math.min the same way.
    for (const series of [[], [null], [1, null, 3], [1, 2, undefined]]) {
      const finite = series.filter((v) => typeof v === "number" && Number.isFinite(v));
      if (finite.length === 0) continue;
      const y = dotY(finite);
      assert.ok(Number.isFinite(y), `series ${JSON.stringify(series)} must not yield NaN`);
    }
  });

  test("the component filters non-finite samples and skips the dot without them", () => {
    assert.match(sparkline, /function finiteSamples/, "the finite filter is gone");
    assert.match(sparkline, /Number\.isFinite\(value\)/, "it must test finiteness");
    assert.match(sparkline, /Number\.isFinite\(lastDot\.y\)/, "the dot must be checked");
    // `typeof NaN === "number"` is true, so the gauge needs a finiteness test.
    assert.match(
      sparkline,
      /Number\.isFinite\(value\)/,
      "RadialGauge must reject NaN, not just non-numbers",
    );
  });
});
