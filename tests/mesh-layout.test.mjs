import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, describe } from "node:test";
import { readFile } from "node:fs/promises";

import {
  AGENT_RADIUS,
  activeAgents,
  arcSpacing,
  bubblesFit,
  bubbleRadius,
  CENTER,
  contentViewBox,
  GLYPH_FONT,
  isActive,
  LABEL_HALF_WIDTH,
  labelOffsets,
  NAME_FONT,
  ORCH_RADIUS,
  PORT_FONT,
  RADIUS,
  SIZE,
  visibleLinks,
} from "@/lib/data/mesh-layout";
import { PROFILES } from "@/lib/data/profiles";
import { readHierarchy, readRegistry } from "@/lib/data/registry";

/**
 * The real reporting hierarchy, not a fixture invented for this file. The edge
 * set used to be a complete graph of the seven seed profiles with `strength`
 * and `latency` derived from arithmetic on port numbers; reading the registry
 * instead means these tests exercise the same data the graph draws.
 */
const LINKS = readHierarchy();

function agent(id, status) {
  return { id, name: id, port: 9900, role: "x", status, load: 10, latency: 5 };
}

test("neighbouring bubbles do not touch, at the full roster size", () => {
  // The ring held 26 nodes, which left ~53px between centres while the bubbles
  // were 56px across. Neighbours overlapped by construction.
  const spacing = arcSpacing(26, RADIUS);
  assert.ok(
    spacing > 2 * Math.max(ORCH_RADIUS, AGENT_RADIUS),
    `arc ${spacing.toFixed(1)}px must exceed the widest bubble diameter`,
  );
  assert.ok(bubblesFit(26), "26 bubbles must still fit the ring");
});

test("a wider ring of stopped agents would have caught itself", () => {
  // Reverting the radii is what this guards: 28px agents again, and 26 of them,
  // is the crowded chart the fix was for.
  assert.ok(!bubblesFit(26, 120), "a 120px ring cannot hold 26 bubbles");
  assert.ok(bubblesFit(8, 120), "an 8-node ring fits the same bubbles");
  assert.ok(bubblesFit(0), "an empty ring is not a crowding failure");
});

test("the orchestrator keeps a slightly larger bubble than the rest", () => {
  assert.ok(bubbleRadius("default") > bubbleRadius("ceo-bor"));
});

test("labels stay attached to the bubble instead of floating below it", () => {
  for (const id of ["default", "ceo-bor"]) {
    const r = bubbleRadius(id);
    const { name, port, glyph } = labelOffsets(id);
    // Every label line clears the circle, and none sits so far out that it
    // reads as belonging to the node two positions clockwise.
    assert.ok(name > r, `${id}: name label must clear the bubble`);
    assert.ok(port > name, `${id}: port label must sit below the name`);
    assert.ok(glyph < r, `${id}: glyph must stay inside the bubble`);
    assert.ok(port - r <= 30, `${id}: labels must track the radius, not a constant`);
  }
});

test("offline agents leave the ring", () => {
  assert.equal(isActive(agent("ceo-bor", "offline")), false);
  for (const status of ["online", "busy", "degraded"]) {
    assert.equal(isActive(agent("ceo-bor", status)), true, `${status} is up`);
  }
  assert.deepEqual(
    activeAgents([agent("a", "online"), agent("b", "offline"), agent("c", "degraded")]).map(
      (a) => a.id,
    ),
    ["a", "c"],
  );
});

test("links to hidden agents are neither drawn nor counted", () => {
  const agents = [
    agent("ceo-bor", "online"),
    agent("frontend", "online"),
    agent("hermes-operator", "offline"),
  ];
  const shown = visibleLinks(LINKS, agents);
  const ids = new Set(agents.filter(isActive).map((a) => a.id));
  for (const link of shown) {
    assert.ok(ids.has(link.source), `${link.source} must be on the ring`);
    assert.ok(ids.has(link.target), `${link.target} must be on the ring`);
  }
  // Every surviving link really exists in the source data — the filter narrows,
  // it never invents or reorders.
  for (const link of shown) {
    assert.ok(
      LINKS.includes(link),
      "visible links must be the same objects the chart draws from",
    );
  }
});

test("dropping a running agent removes its links from the header count", () => {
  const all = PROFILES.map((p) => agent(p.id, "online"));
  // Taken from the roster rather than typed in: the link set is derived from
  // PROFILES, so a hand-written id would silently make this test vacuous.
  const victim = PROFILES[PROFILES.length - 1].id;
  const oneDown = all.map((a) => (a.id === victim ? agent(a.id, "offline") : a));
  assert.ok(
    visibleLinks(LINKS, oneDown).length < visibleLinks(LINKS, all).length,
    "an offline node must cost the header a link, or the badge overstates the mesh",
  );
});

test("no link can outlive both of its endpoints", () => {
  const allOffline = PROFILES.map((p) => agent(p.id, "offline"));
  assert.equal(visibleLinks(LINKS, allOffline).length, 0);
  assert.equal(activeAgents(allOffline).length, 0);
});

test("the component draws and counts from the same filtered list", async () => {
  // `visibleLinks` passing in a unit test says nothing about whether the
  // component calls it. Hardcoding the count keeps every
  // test in this file green while the header overstates the mesh, so the
  // wiring itself is what has to be asserted.
  const file = await readFile(
    new URL("../components/dashboard/mesh-graph.tsx", import.meta.url),
    "utf8",
  );
  // Scoped to the chart. `AgentStrip` shares this file and legitimately lists
  // the whole roster: it is the focus picker on the agents and kanban routes,
  // and an offline agent is still worth selecting there.
  const start = file.indexOf("export function MeshGraph");
  const source = file.slice(start, file.indexOf("\nexport function", start + 1));
  assert.ok(start > 0, "MeshGraph must exist in this file");
  // The badge lives in MeshLegend, in this same file.
  const legendStart = file.indexOf("export function MeshLegend");
  const legend = file.slice(legendStart);

  // Links: drawn from the filtered prop, not from a module constant. The
  // component no longer imports one at all, so asserting the absence of a name
  // would prove nothing — what matters is that it filters what it is handed.
  assert.match(source, /visibleLinks\(hierarchy, agents\)/);
  // Header badge: counted from the same filtered list, and named for what the
  // lines are. "links" beside a reporting hierarchy reads as traffic.
  assert.match(
    legend,
    /visibleLinks\(hierarchy, agents\)\.length} reporting lines/,
    "the count must come from the filtered list and be named for what it is",
  );
  // Bubbles: the ring holds active agents only.
  assert.ok(
    !/\{\s*agents\.map\(/.test(source),
    "bubbles must render the active subset, not the full roster",
  );
  for (const symbol of ["activeAgents(", "visibleLinks(", "bubbleRadius("]) {
    assert.ok(source.includes(symbol), `${symbol} must be wired into the component`);
  }
});

test("the viewBox is shorter than the old square, which is the point", () => {
  const [, , width, height] = contentViewBox().split(" ").map(Number);
  // 620x620 forced the card to be as tall as it was wide. The cropped box is
  // what lets the mesh card fit on a screen.
  assert.ok(height < SIZE, `height ${height} must be under the old ${SIZE}`);
  assert.ok(width / height > 1.1, "the box should use the width it is given");
});

test("every bubble and port label fits inside the cropped box", () => {
  const [x, y, width, height] = contentViewBox().split(" ").map(Number);
  const right = x + width;
  const bottom = y + height;

  for (const count of [1, 2, 7, 8, 26]) {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      const px = CENTER + Math.cos(angle) * RADIUS;
      const py = CENTER + Math.sin(angle) * RADIUS;
      // The widest bubble, the orchestrator's, is used for every node so the
      // check does not quietly pass because the sample was all small ones.
      const r = ORCH_RADIUS;
      assert.ok(px - r >= x, `${count} nodes: left bubble edge clipped`);
      assert.ok(px + r <= right, `${count} nodes: right bubble edge clipped`);
      assert.ok(py - r >= y, `${count} nodes: top bubble edge clipped`);
      // Port label sits below the bubble, so the bottom node is the tight one.
      assert.ok(py + PORT_FONT + 6 <= bottom, `${count} nodes: port label clipped`);
    }
  }
});

test("the widest registry name still fits within the horizontal allowance", () => {
  // "principal-engineer" is the longest id in the registry. The label is centred
  // under its bubble, so what matters is the room from a node at the ring
  // extreme to the edge of the box — not the label allowance on its own.
  const [x, , width] = contentViewBox().split(" ").map(Number);
  const room = x + width - (CENTER + RADIUS);
  const needed = ("principal-engineer".length * NAME_FONT * 0.62) / 2;
  assert.ok(
    needed <= room,
    `"principal-engineer" needs ${needed.toFixed(0)}px, the box leaves ${room.toFixed(0)}px`,
  );
  assert.ok(room >= LABEL_HALF_WIDTH, "the allowance must fit inside the box");
});

test("label fonts are not scaled below what the old square rendered", () => {
  // The box is smaller, so the SVG draws it larger on screen. These are the
  // sizes the crop has to pay for, and they must not quietly shrink again.
  assert.ok(NAME_FONT >= 10, "name labels stay at least as legible as before");
  assert.ok(PORT_FONT >= 9, "port labels stay at least as legible as before");
  assert.ok(GLYPH_FONT >= 10, "glyphs stay at least as legible as before");
});

/**
 * The edges were a complete graph of the seven seed profiles, with `strength`
 * from `(i * 7 + port) % 11` deciding the line width and `latency` from
 * `(port + port) % 17` deciding an animated "hot" overlay. Both were invented,
 * and the overlay was the part that actually read as live A2A traffic. The
 * graph now draws the registry's `reports_to` and nothing else.
 */
describe("the graph draws a real hierarchy, not invented traffic", () => {
  test("every edge is a reports_to line from the registry", () => {
    const registry = readRegistry();
    const declared = new Set(
      registry.agents.flatMap((agent) =>
        agent.reports_to ? [`${agent.id}->${agent.reports_to}`] : [],
      ),
    );
    assert.ok(declared.size > 0, "the registry must state a hierarchy at all");
    for (const link of LINKS) {
      assert.ok(
        declared.has(`${link.source}->${link.target}`),
        `${link.source}->${link.target} is not a declared reporting line`,
      );
      assert.equal(link.kind, "reports-to");
    }
  });

  test("an edge carries no number nobody measured", () => {
    const types = readFileSync(new URL("../lib/types.ts", import.meta.url), "utf8");
    // The block only, not the rest of the file: `Agent` below it has a real
    // `latency` (the collector measures hop time), and slicing to EOF would
    // make this test fail on an honest field.
    const start = types.indexOf("export type MeshLink");
    const block = types.slice(start, types.indexOf("};", start) + 2);
    // Comments are stripped first: the field's own doc comment names what it
    // replaced, and matching prose would fail for the wrong reason.
    const code = block.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /strength/, "line width must not come from an invented number");
    assert.doesNotMatch(code, /latency/, "a link has no measured latency of its own");
    assert.match(code, /kind: "reports-to"/, "and it says which kind of line it is");
  });

  test("nothing is drawn from a per-link measurement", async () => {
    const file = await readFile(
      new URL("../components/dashboard/mesh-graph.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(file, /link\.strength/, "must not size a line from a fabricated strength");
    assert.doesNotMatch(file, /link\.latency/, "must not label a line with a fabricated latency");
    // The animated overlay is what made a fabricated edge look like live flow.
    assert.doesNotMatch(
      file,
      /animateMotion|animate-dash-flow/,
      "a dashed flow animation on an unmeasured edge is a traffic claim",
    );
  });

  test("the link source is the registry, not the seed profiles", async () => {
    const profiles = await readFile(
      new URL("../lib/data/profiles.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      profiles,
      /MESH_LINKS/,
      "the complete graph of seed profiles is the thing being removed",
    );
  });

  test("a self-reporting agent does not draw a loop to itself", () => {
    for (const link of LINKS) {
      assert.notEqual(link.source, link.target);
    }
  });
});
