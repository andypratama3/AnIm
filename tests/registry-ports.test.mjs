import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { portForProfile, probeableProfiles, readRegistry } from "../lib/data/registry.ts";

/**
 * Ports used to be hand-copied into `remote-probe.ts`, and the copy drifted: the
 * table claimed `frontend` was on 9907 while the registry said 9905. Probing a
 * live agent on a dead port reports it offline, so the drift is a correctness
 * bug, not a tidiness one. These tests make the registry the only place a port
 * may come from.
 */
describe("registry is the single source of port truth", () => {
  test("ports come from agents/registry.json", () => {
    const registry = readRegistry();
    const frontend = registry.agents.find((a) => a.id === "frontend");
    assert.ok(frontend, "frontend must exist in the registry");
    assert.equal(portForProfile("frontend"), frontend.port);
  });

  test("no module hardcodes a mesh port table any more", () => {
    const src = readFileSync(new URL("../lib/data/remote-probe.ts", import.meta.url), "utf8");
    assert.ok(
      !/const PORTS/.test(src),
      "remote-probe must not keep its own port table; it drifted from the registry once already",
    );
    // Any literal 99xx in the probe module would be a reintroduced copy.
    const literals = src.match(/\b99[0-2]\d\b/g) ?? [];
    assert.deepEqual(literals, [], `found hardcoded mesh ports: ${literals.join(", ")}`);
  });

  test("every probeable profile has a port inside the reserved range", () => {
    for (const id of probeableProfiles()) {
      const port = portForProfile(id);
      assert.ok(port !== null, `${id} is listed as probeable but has no port`);
      assert.ok(
        port >= 9900 && port <= 9925,
        `${id} has port ${port}, outside the reserved 9900-9925 range`,
      );
    }
  });

  test("no two profiles claim the same port", () => {
    const seen = new Map();
    for (const id of probeableProfiles()) {
      const port = portForProfile(id);
      const owner = seen.get(port);
      assert.equal(
        owner,
        undefined,
        `port ${port} is claimed by both ${owner} and ${id}; one would shadow the other`,
      );
      seen.set(port, id);
    }
  });

  test("a profile with no assigned port reports null, not a guess", () => {
    const registry = readRegistry();
    const unassigned = registry.agents.filter((a) => typeof a.port !== "number");
    assert.ok(unassigned.length > 0, "the registry should still have unassigned profiles");
    for (const agent of unassigned) {
      assert.equal(
        portForProfile(agent.id),
        null,
        `${agent.id} has no port and must not resolve to one`,
      );
    }
  });

  test("an unknown profile resolves to null rather than throwing", () => {
    assert.equal(portForProfile("definitely-not-an-agent"), null);
  });
});
