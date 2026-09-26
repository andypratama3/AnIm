import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

import {
  AGENT_RADIUS,
  activeAgents,
  arcSpacing,
  bubblesFit,
  bubbleRadius,
  isActive,
  labelOffsets,
  ORCH_RADIUS,
  RADIUS,
  visibleLinks,
} from "@/lib/data/mesh-layout";
import { MESH_LINKS, PROFILES } from "@/lib/data/profiles";

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
  const shown = visibleLinks(MESH_LINKS, agents);
  const ids = new Set(agents.filter(isActive).map((a) => a.id));
  for (const link of shown) {
    assert.ok(ids.has(link.source), `${link.source} must be on the ring`);
    assert.ok(ids.has(link.target), `${link.target} must be on the ring`);
  }
  // Every surviving link really exists in the source data — the filter narrows,
  // it never invents or reorders.
  for (const link of shown) {
    assert.ok(
      MESH_LINKS.includes(link),
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
    visibleLinks(MESH_LINKS, oneDown).length < visibleLinks(MESH_LINKS, all).length,
    "an offline node must cost the header a link, or the badge overstates the mesh",
  );
});

test("no link can outlive both of its endpoints", () => {
  const allOffline = PROFILES.map((p) => agent(p.id, "offline"));
  assert.equal(visibleLinks(MESH_LINKS, allOffline).length, 0);
  assert.equal(activeAgents(allOffline).length, 0);
});

test("the component draws and counts from the same filtered list", async () => {
  // `visibleLinks` passing in a unit test says nothing about whether the
  // component calls it. Reverting the badge to MESH_LINKS.length keeps every
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

  // Links: drawn from the filtered list, never straight off the constant.
  assert.ok(!/\{\s*MESH_LINKS\.map\(/.test(source), "must not draw MESH_LINKS raw");
  // Header badge: counted, not assumed.
  assert.ok(
    !/\{MESH_LINKS\.length\}\s*links/.test(source),
    "the links badge must count what is drawn, not the source constant",
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
