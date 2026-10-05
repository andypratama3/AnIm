import { getRemoteInventory, type RemoteAgent, type RemoteInventory } from "@/lib/data/remote";
import { createSnapshot } from "@/lib/data/engine";
import { readHierarchy } from "@/lib/data/registry";
import { PROFILES } from "@/lib/data/profiles";
import { readA2AAudit } from "@/lib/data/hermes-a2a";
import {
  buildSeries,
  perAgentSeries,
  recordSample,
  readSamples,
  windowTotals,
} from "@/lib/data/history-store";
import type { Agent, AgentStatus, HeatCell, MeshSnapshot, Series } from "@/lib/types";

const DEPARTMENTS: Record<string, string> = {
  "office-of-owner": "Office of the Owner",
  "product-operations": "Product & Operations",
  engineering: "Engineering",
  "knowledge-content": "Knowledge & Content",
  "commercial-finance": "Commercial & Finance",
};

function accentFor(id: string): string {
  return PROFILES.find((profile) => profile.id === id)?.accent ?? "var(--brand)";
}

function statusFor(agent: RemoteAgent): AgentStatus {
  if (!agent.processRunning) return "offline";
  return agent.a2aReachable ? "online" : "degraded";
}

function healthFor(): number | null {
  return null;
}

function toAgent(agent: RemoteAgent): Agent {
  const status = statusFor(agent);
  return {
    id: agent.id,
    role: DEPARTMENTS[agent.department ?? ""] ?? agent.department ?? "Unassigned",
    port: agent.port ?? null,
    status,
    model: "unknown",
    provider: "unknown",
    health: healthFor(),
    latencyMs: typeof agent.probeMs === "number" && Number.isFinite(agent.probeMs) ? agent.probeMs : null,
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

function heatFromInventory(): HeatCell[] {
  return [];
}

export type LiveMesh =
  | { mode: "live"; snapshot: MeshSnapshot; inventory: RemoteInventory; latencyMs: number }
  | { mode: "simulated"; snapshot: MeshSnapshot; reason: string };

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
  let agents = inventory.agents.map((agent) => toAgent(agent));
  const online = agents.filter((agent) => agent.status === "online").length;
  const degraded = agents.filter((agent) => agent.status === "degraded").length;
  const offline = agents.filter((agent) => agent.status === "offline").length;

  const running = agents.filter((agent) => agent.status !== "offline");
  const reachablePairs =
    running.reduce((sum, agent) => sum + Math.min(agent.peers, running.length - 1), 0) / 2;

  const audit = await readA2AAudit();
  const a2aTotal = audit.mode === "live" ? audit.total : 0;
  const a2aErrors = audit.mode === "live" ? audit.errors ?? 0 : 0;

  const probeMap: Record<string, number> = {};
  for (const a of inventory.agents) {
    if (typeof a.probeMs === "number" && Number.isFinite(a.probeMs)) {
      probeMap[a.id] = a.probeMs;
    }
  }

  await recordSample({
    collectMs: remote.latencyMs,
    online,
    degraded,
    offline,
    links: Math.round(reachablePairs),
    probes: probeMap,
    a2aTotal,
    a2aErrors,
  });

  const samples = await readSamples();
  const series = buildSeries(samples) as Series & { p95?: Array<number | null> };
  const totalsHistory = windowTotals(samples);

  const agentIds = agents.map((a) => a.id);
  const perAgent = perAgentSeries(
    agentIds,
    audit.mode === "live" ? audit.entries : [],
    30 * 60 * 1000,
    series.resolutionSec,
  );
  agents = agents.map((a) => ({ ...a, throughput: perAgent[a.id] ?? [] }));

  const snapshot: MeshSnapshot = {
    generatedAt: now,
    source: "live",
    agents,
    hierarchy: readHierarchy(),
    series: {
      labels: series.labels,
      throughput: series.throughput,
      latency: series.latency,
      errors: series.errors,
      tokens: [],
      resolutionSec: series.resolutionSec,
      synthetic: false,
      p95: series.p95,
      tokensMeasured: false,
    },
    heat: heatFromInventory(),
    totals: {
      online,
      degraded,
      offline,
      busy: null,
      tasks: null,
      tokens: null,
      avgLatency: totalsHistory.avgLatency,
      p95Latency: totalsHistory.p95Latency,
      collectMs: totalsHistory.collectMs,
      successRate: totalsHistory.successRate,
      meshLinks: Math.round(reachablePairs),
    },
  };

  return { mode: "live", snapshot, inventory, latencyMs: remote.latencyMs };
}
