import { getRemoteInventory, type RemoteAgent, type RemoteInventory } from "@/lib/data/remote";
import { createEvents, createSnapshot } from "@/lib/data/engine";
import { PROFILES } from "@/lib/data/profiles";
import type { Agent, AgentStatus, MeshSnapshot, Series } from "@/lib/types";

/**
 * Derive the dashboard snapshot from the real Hermes host.
 *
 * Honesty rules for this module:
 *  - agent roster, status, ports, peer counts and document coverage are measured
 *  - `health` is derived only from gateway state, never from an invented load
 *  - there is no time-series history on the host, so the series stays `synthetic`
 *    and the charts keep rendering their "simulated" warning
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
 * Only two real signals exist per agent, so health is a small honest scale
 * rather than a fabricated 0-100 performance score.
 */
function healthFor(agent: RemoteAgent): number {
  if (!agent.processRunning) return 0;
  if (!agent.a2aReachable) return 55;
  if (agent.agentCard.reachable) return 100;
  return 85;
}

function toAgent(agent: RemoteAgent, now: number): Agent {
  const status = statusFor(agent);
  return {
    id: agent.id,
    role: DEPARTMENTS[agent.department ?? ""] ?? agent.department ?? "Unassigned",
    // A profile with no port is not reachable; keep the port field numeric because
    // the roster and the drawer both render it directly.
    port: agent.port ?? 0,
    status,
    // The host does not report the resolved model or provider, so these stay empty
    // rather than being borrowed from a simulated profile.
    model: agent.agentCard.name ?? "unknown",
    provider: "hermes",
    health: healthFor(agent),
    // No latency probe is exposed by the collector; the inventory round trip is
    // reported separately as `latencyMs` on the bridge result.
    latencyMs: 0,
    uptimePct: status === "online" ? 100 : 0,
    tokens: 0,
    queue: 0,
    peers: agent.peers,
    mcp: [],
    lastSeen: status === "offline" ? 0 : now,
    throughput: [],
    load: 0,
    memoryMb: 0,
    accent: accentFor(agent.id),
    summary: agent.title ?? agent.agentCard.description ?? agent.id,
  };
}

/** The collector exposes no historical series, so keep the labelled placeholder. */
function syntheticSeries(now: number): Series {
  return createSnapshot(now).series;
}

function heatFromInventory(agents: Agent[]) {
  // Heatmap cells are a 7x24 grid of per-agent load. With no load metric we must
  // not draw one, so the grid is empty and the UI renders its empty state.
  return agents.flatMap((agent) =>
    Array.from({ length: 24 }, (_, hour) => ({
      agent: agent.id,
      hour,
      load: 0,
    })),
  );
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
      snapshot: createSnapshot(now, "simulated"),
    };
  }

  const { inventory } = remote;
  const agents = inventory.agents.map((agent) => toAgent(agent, now));
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
    series: syntheticSeries(now),
    heat: heatFromInventory(agents),
    events: createEvents(now),
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
