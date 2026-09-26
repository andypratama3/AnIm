import { PROFILES } from "@/lib/data/profiles";
import { createSnapshot } from "@/lib/data/engine";
import { readHierarchy } from "@/lib/data/registry";
import type { AgentStatus, MeshSnapshot } from "@/lib/types";

type Endpoint = { id: string; url: string };

export function parseGateways(raw: string | undefined): Endpoint[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const [maybeId, maybeUrl] = chunk.includes("=")
        ? [chunk.slice(0, chunk.indexOf("=")), chunk.slice(chunk.indexOf("=") + 1)]
        : [undefined, chunk];
      return {
        id: maybeId ?? PROFILES[index]?.id ?? `agent-${index}`,
        url: maybeUrl.replace(/\/$/, ""),
      };
    })
    .filter((endpoint) => /^https?:\/\//.test(endpoint.url));
}

type Probe = {
  id: string;
  reachable: boolean;
  latencyMs: number;
  status: AgentStatus;
  health?: number;
  uptimePct?: number;
  load?: number;
  memoryMb?: number;
  queue?: number;
  tokens?: number;
  detail?: string;
};

function normalizeStatus(value: unknown, reachable: boolean): AgentStatus {
  if (!reachable) return "offline";
  const raw = String(value ?? "").toLowerCase();
  if (["ok", "healthy", "online", "running", "up", "200"].includes(raw)) return "online";
  if (["degraded", "warning", "unstable", "partial"].includes(raw)) return "degraded";
  if (["error", "down", "failed", "offline"].includes(raw)) return "degraded";
  if (["busy", "saturated", "throttled"].includes(raw)) return "busy";
  return "online";
}

async function probe(endpoint: Endpoint): Promise<Probe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_500);

  try {
    const response = await fetch(`${endpoint.url}/health`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return { id: endpoint.id, reachable: false, latencyMs, status: "degraded" };
    }
    const payload = (await response.json()) as Record<string, unknown>;
    return {
      id: endpoint.id,
      reachable: true,
      latencyMs,
      status: normalizeStatus(payload.status ?? payload.state, true),
      health: typeof payload.health === "number" ? payload.health : undefined,
      uptimePct: typeof payload.uptime === "number" ? payload.uptime : undefined,
      load: typeof payload.load === "number" ? payload.load : undefined,
      memoryMb: typeof payload.memory_mb === "number" ? payload.memory_mb : undefined,
      queue: typeof payload.queue === "number" ? payload.queue : undefined,
      tokens: typeof payload.tokens === "number" ? payload.tokens : undefined,
      detail: typeof payload.detail === "string" ? payload.detail : undefined,
    };
  } catch {
    return { id: endpoint.id, reachable: false, latencyMs: Date.now() - started, status: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

export async function getMeshSnapshot(): Promise<MeshSnapshot> {
  const endpoints = parseGateways(process.env.ANIM_GATEWAY_URLS);
  // The registry ships with the app, so the reporting hierarchy is available on
  // both the live and the simulated path. Reading it here keeps `engine.ts` free
  // of `node:fs` for the client component that imports it.
  const fallback = createSnapshot(Date.now(), "simulated", readHierarchy());

  if (endpoints.length === 0) return fallback;

  const probes = await Promise.all(endpoints.map(probe));
  const reachable = probes.filter((p) => p.reachable).length;
  if (reachable === 0) return { ...fallback, source: "simulated" };

  const byId = new Map(probes.map((probe) => [probe.id, probe]));

  const agents = fallback.agents.map((agent) => {
    const probe = byId.get(agent.id);
    if (!probe || !probe.reachable) {
      return { ...agent, status: "offline" as AgentStatus, health: 0, lastSeen: Date.now() };
    }
    return {
      ...agent,
      status: probe.status,
      health: probe.health ?? agent.health,
      uptimePct: probe.uptimePct ?? agent.uptimePct,
      load: probe.load ?? agent.load,
      memoryMb: probe.memoryMb ?? agent.memoryMb,
      queue: probe.queue ?? agent.queue,
      tokens: probe.tokens ?? agent.tokens,
      latencyMs: Math.round(probe.latencyMs),
      lastSeen: Date.now(),
    };
  });

  const offline = agents.filter((a) => a.status === "offline").length;

  return {
    ...fallback,
    source: "live",
    agents,
    totals: {
      ...fallback.totals,
      online: agents.filter((a) => a.status === "online").length,
      busy: agents.filter((a) => a.status === "busy").length,
      degraded: agents.filter((a) => a.status === "degraded").length,
      offline,
      tasks: agents.reduce((sum, a) => sum + (a.queue ?? 0), 0),
      tokens: agents.reduce((sum, a) => sum + (a.tokens ?? 0), 0),
      // Only agents that actually reported a latency may contribute to the mean,
      // and a mean over zero samples is unmeasured rather than zero.
      avgLatency: (() => {
        const seen = agents
          .filter((a) => a.status !== "offline" && a.latencyMs != null)
          .map((a) => a.latencyMs as number);
        return seen.length > 0
          ? Math.round(seen.reduce((sum, v) => sum + v, 0) / seen.length)
          : null;
      })(),
    },
  };
}
