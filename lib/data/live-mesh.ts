import { getRemoteInventory, type RemoteAgent, type RemoteInventory } from "@/lib/data/remote";
import { createSnapshot } from "@/lib/data/engine";
import { readHierarchy } from "@/lib/data/registry";
import { PROFILES } from "@/lib/data/profiles";
import type { Agent, AgentStatus, HeatCell, MeshSnapshot, Series } from "@/lib/types";

/**
 * Derive the dashboard snapshot from the real Hermes host.
 *
 * Honesty rules for this module:
 *  - agent roster, status, ports, peer counts and document coverage are measured
 *  - `health` is derived only from gateway state, never from an invented load
 *  - there is no time-series history on the host, so the series and the heat grid
 *    are EMPTY. An earlier version filled them from the local generator, which
 *    meant a live deploy drew random numbers that moved on every poll and were
 *    indistinguishable from telemetry. The charts now render their empty state
 *    and say why, which is the only truthful option until the host exports
 *    history. `series.synthetic` stays in the type so the simulated fallback can
 *    still label itself.
 */

const DEPARTMENTS: Record<string, string> = {
  "office-of-the-owner": "Office of the Owner",
  "product-and-operations": "Product & Operations",
  engineering: "Engineering",
  "knowledge-and-content": "Knowledge & Content",
  "commercial-and-finance": "Commercial & Finance",
};

/** Reuse the accent already assigned to each profile so colours stay stable. */
function accentFor(id: string): string {
  return PROFILES.find((profile) => profile.id === id)?.accent ?? "var(--brand)";
}

/**
 * Status comes from the process state the host reports.
 *  - process up and the A2A port answers  -> online
 *  - process up but the port is silent     -> degraded (real, observable fault)
 *  - process not running                   -> offline
 * A gateway that never answered cannot be "busy": we have no queue metric, and
 * inventing one is exactly the defect this project is removing.
 */
function statusFor(agent: RemoteAgent): AgentStatus {
  if (!agent.processRunning) return "offline";
  return agent.a2aReachable ? "online" : "degraded";
}

/**
 * Only two real signals exist per agent, and neither is a performance score.
 *
 * The old version returned 100 / 85 / 55 / 0, so a reachable agent read as
 * "100" and a degraded one as "55" — numbers that look like measurements of
 * quality but are a hand-picked ladder, and that render as a full or half meter
 * in the roster. Nothing on the host reports a score, so the field is `null` and
 * the UI shows an em dash. Reachable state is already carried by
 * `Agent.status`, which is the honest place for it.
 */
function healthFor(): number | null {
  return null;
}

function toAgent(agent: RemoteAgent): Agent {
  const status = statusFor(agent);
  return {
    id: agent.id,
    role: DEPARTMENTS[agent.department ?? ""] ?? agent.department ?? "Unassigned",
    // A profile with no port is not reachable; keep the port field numeric because
    // the roster and the drawer both render it directly.
    // No `?? 0`: an unassigned port is unknown, not zero.
    port: agent.port ?? null,
    status,
    // The host does not report the resolved model or provider, so both stay
    // unknown rather than borrowed from a simulated profile. The agent card
    // name is an identity, not a model: `agentCard.name` would put "Bor" or
    // "Aria" in a column labelled Model and read as a resolved model. The
    // drawer renders an em dash for these, the same as the unmeasured numbers.
    model: "unknown",
    provider: "unknown",
    health: healthFor(),
    // The collector exposes no latency probe, uptime history, token counter,
    // queue depth, load or memory figure. These stay null so the roster and the
    // drawer render an em dash instead of a fabricated `0`/`100`. The inventory
    // round trip is reported separately as `latencyMs` on the bridge result,
    // which measures the SSH call and not the agent.
    latencyMs: null,
    uptimePct: null,
    tokens: null,
    queue: null,
    peers: agent.peers,
    mcp: [],
    lastSeen: null,
    throughput: [],
    load: null,
    memoryMb: null,
    accent: accentFor(agent.id),
    summary: agent.title ?? agent.agentCard.description ?? agent.id,
  };
}

/**
 * No historical series exist on the host, so live mode reports none.
 *
 * This used to call the local generator, which is the worst of both worlds: the
 * numbers were invented *and* the provenance flag said `synthetic`, so the UI
 * did render a warning — but the chart underneath was still a fabricated
 * throughput trace that reshuffled on every 5s poll, and the "simulated" badge
 * was easy to miss next to a plausible-looking graph. Empty is honest; a
 * labelled lie is still a lie.
 *
 * `labels` is empty too, so a consumer that zips labels against the numeric
 * arrays cannot pair a real timestamp with an invented value.
 */
function noSeries(): Series {
  return {
    labels: [],
    throughput: [],
    latency: [],
    errors: [],
    tokens: [],
    resolutionSec: 60,
    synthetic: false,
  };
}

/**
 * The collector reports no load metric, so there is no heat grid to draw.
 *
 * The previous version returned 24 zero-valued cells per agent, which rendered a
 * full, uniformly idle week heatmap — while the comment above it promised an
 * empty grid and the empty state. 26 agents x 24 = 624 invented cells. Returning
 * nothing lets `/analytics` show the empty state the code always claimed was
 * the behaviour.
 */
function heatFromInventory(): HeatCell[] {
  return [];
}

export type LiveMesh =
  | { mode: "live"; snapshot: MeshSnapshot; inventory: RemoteInventory; latencyMs: number }
  | { mode: "simulated"; snapshot: MeshSnapshot; reason: string };

/**
 * Prefer the real host. Fall back to the simulated snapshot, but say so in
 * `source` so the UI can label it instead of presenting it as measured.
 */
export async function getMeshSnapshotLive(): Promise<LiveMesh> {
  const remote = await getRemoteInventory();
  const now = Date.now();

  if (remote.mode === "unavailable") {
    return {
      mode: "simulated",
      reason: remote.reason,
      snapshot: createSnapshot(now, "simulated", readHierarchy()),
    };
  }

  const { inventory } = remote;
  const agents = inventory.agents.map((agent) => toAgent(agent));
  const online = agents.filter((agent) => agent.status === "online").length;
  const degraded = agents.filter((agent) => agent.status === "degraded").length;
  const offline = agents.filter((agent) => agent.status === "offline").length;

  // Measured pair count: two agents are a link only when both ends are running.
  const running = agents.filter((agent) => agent.status !== "offline");
  const reachablePairs =
    running.reduce((sum, agent) => sum + Math.min(agent.peers, running.length - 1), 0) / 2;

  const snapshot: MeshSnapshot = {
    generatedAt: now,
    source: "live",
    agents,
    hierarchy: readHierarchy(),
    series: noSeries(),
    heat: heatFromInventory(),
    totals: {
      online,
      degraded,
      offline,
      // The collector exposes no queue depth, token counter, latency histogram
      // or request/error tally, so these stay null. The UI renders an em dash
      // rather than a fabricated zero.
      busy: null,
      tasks: null,
      tokens: null,
      avgLatency: null,
      p95Latency: null,
      successRate: null,
      // Only count links whose both ends are actually running.
      meshLinks: Math.round(reachablePairs),
    },
  };

  return { mode: "live", snapshot, inventory, latencyMs: remote.latencyMs };
}
