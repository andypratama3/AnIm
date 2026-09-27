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

/**
 * `Agent.port` was typed `number` and the live collector filled the gap with
 * `agent.port ?? 0`. The registry only assigns ports to a handful of the 26
 * agents, so the unassigned majority rendered as `:0` in the graph, the drawer,
 * the command palette and every copied line — a real-looking port for something
 * never measured. `portForProfile` above already answered "no port" with null;
 * the display type now agrees with it.
 */
describe("an unassigned port is never displayed as a number", () => {
  test("Agent.port is nullable so `?? 0` cannot reappear unnoticed", () => {
    const types = readFileSync(new URL("../lib/types.ts", import.meta.url), "utf8");
    const agent = types.slice(types.indexOf("export type Agent = {"));
    assert.match(agent, /port: number \| null;/);
  });

  test("the live collector forwards null rather than inventing a port", () => {
    const live = readFileSync(new URL("../lib/data/live-mesh.ts", import.meta.url), "utf8");
    assert.doesNotMatch(live, /port: agent\.port \?\? 0/);
    assert.match(live, /port: agent\.port \?\? null/);
  });

  test("no component interpolates a port directly", () => {
    // The four surfaces that print a port, read back as one blob.
    const text = [
      "../components/layout/topbar.tsx",
      "../components/layout/command-palette.tsx",
      "../components/dashboard/agent-drawer.tsx",
      "../components/dashboard/mesh-graph.tsx",
    ]
      .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
      .join("\n");
    assert.doesNotMatch(text, /\$\{agent\.port\}/, "a template literal would print 'null'");
    assert.doesNotMatch(text, />:\{agent\.port\}</, "JSX would leave a bare colon");
    assert.match(text, /formatPort\(agent\.port\)/);
    assert.match(text, /describePort\(agent\.port\)/);
  });
});

describe("port rendering is honest in both registers", () => {
  test("compact form reads as a port, or as absent", async () => {
    const { formatPort, describePort } = await import("../lib/format.ts");
    assert.equal(formatPort(9905), ":9905");
    assert.equal(formatPort(null), "—");
    assert.equal(formatPort(undefined), "—");
    assert.equal(describePort(9905), "port 9905");
    assert.equal(describePort(null), "no port assigned");
  });

  test("port 0 is still a real number if a collector ever reports one", async () => {
    const { formatPort } = await import("../lib/format.ts");
    assert.equal(formatPort(0), ":0");
  });
});

describe("a model the host never reported reads as unmeasured", () => {
  test("unknown, empty and missing all render the em dash", async () => {
    const { describeModel } = await import("../lib/format.ts");
    assert.equal(describeModel("unknown"), "—");
    assert.equal(describeModel("UNKNOWN"), "—");
    assert.equal(describeModel("  Unknown "), "—");
    assert.equal(describeModel(""), "—");
    assert.equal(describeModel("   "), "—");
    assert.equal(describeModel(null), "—");
    assert.equal(describeModel(undefined), "—");
  });

  test("a real value passes through unchanged", async () => {
    const { describeModel } = await import("../lib/format.ts");
    assert.equal(describeModel("thinkingmachines/inkling:free"), "thinkingmachines/inkling:free");
  });

  test("the live path reports no model, and the roster says so", () => {
    // The host reports neither model nor provider, and an agent card name is an
    // identity, not a model. Reading `agentCard.name` into `model` put "Bor" in
    // a column labelled Model; this pins the honest value.
    const source = readFileSync(
      new URL("../lib/data/live-mesh.ts", import.meta.url),
      "utf8",
    );
    // Anchored to the property, not to the word: a prose line about agentCard
    // names also contains "model:", and matching that is how a test ends up
    // asserting against a comment.
    const modelLine = /^\s+model:\s*("[^"]*"),$/m.exec(source);
    assert.ok(modelLine, "could not find the model field on the live path");
    assert.equal(modelLine[1], '"unknown"');
    assert.doesNotMatch(source, /^\s+model:\s*agent\.agentCard\.name/m);
  });

  test("the drawer renders model and provider through the helper", () => {
    const text = readFileSync(
      new URL("../components/dashboard/agent-drawer.tsx", import.meta.url),
      "utf8",
    );
    assert.match(text, /label="Model" value=\{describeModel\(agent\.model\)\}/);
    assert.match(text, /label="Provider" value=\{describeModel\(agent\.provider\)\}/);
    assert.doesNotMatch(text, /label="Model" value=\{agent\.model\}/);
  });
});
