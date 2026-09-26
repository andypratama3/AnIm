import { MCP_TOOLS, MODEL_DEFAULT, PROFILES, PROVIDER, type ProfileDef } from "@/lib/data/profiles";
import type {
  ActivityEvent,
  Agent,
  AgentStatus,
  EventKind,
  EventLevel,
  HeatCell,
  MeshSnapshot,
  Series,
} from "@/lib/types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function wave(tick: number, seed: number, freq: number, phase = 0): number {
  return (
    Math.sin((tick + phase) * freq) * 0.6 +
    Math.sin((tick + phase) * freq * 2.37 + 1.1) * 0.3 +
    Math.sin((tick + phase) * freq * 0.41 + 2.3) * 0.1
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function statusFor(profile: ProfileDef, tick: number, health: number, load: number): AgentStatus {
  if (health < 55) return "offline";
  if (health < 78) return "degraded";
  if (load > 74 || health < 92) return "busy";
  return "online";
}

function buildAgent(profile: ProfileDef, tick: number, now: number): Agent {
  const seed = hash(profile.id);
  const rng = mulberry32(seed);
  const jitter = rng();

  const load = clamp(profile.baseLoad + wave(tick, seed, 0.055, jitter * 9) * 22, 8, 99);
  const health = clamp(
    profile.baseHealth - Math.max(0, load - 70) * 0.42 + wave(tick, seed, 0.031, jitter * 4) * 4,
    42,
    99.6,
  );
  const status = statusFor(profile, tick, health, load);
  const latency = clamp(
    42 + load * 1.35 + wave(tick, seed, 0.08, jitter * 6) * 26 + (status === "degraded" ? 120 : 0),
    18,
    780,
  );

  const throughput = Array.from({ length: 28 }, (_, i) => {
    const t = tick - (27 - i) * 0.22;
    const base = 6 + load * 0.11;
    return Math.max(0, base + wave(t, seed + i, 0.6, jitter) * 6 + (rng() - 0.5) * 1.6);
  });

  const tokens = Math.round(
    (1_180_000 + seed * 37 + tick * 640) * (0.6 + load / 100) * (profile.id === "default" ? 1.6 : 1),
  );

  return {
    id: profile.id,
    role: profile.role,
    port: profile.port,
    status,
    model: MODEL_DEFAULT,
    provider: PROVIDER,
    health: Number(health.toFixed(1)),
    latencyMs: Math.round(latency),
    uptimePct: Number(clamp(health + 1.4 + wave(tick, seed, 0.02) * 0.8, 90, 99.99).toFixed(2)),
    tokens,
    queue: Math.max(0, Math.round((load - 32) / 6 + wave(tick, seed, 0.04, jitter) * 3)),
    peers: PROFILES.length - 1,
    mcp: [...MCP_TOOLS],
    lastSeen: now - Math.round(clamp(wave(tick, seed, 0.1, jitter) * 2200 + 900, 220, 12_000)),
    throughput: throughput.map((v) => Number(v.toFixed(2))),
    load: Number(load.toFixed(1)),
    memoryMb: Math.round(180 + load * 9 + wave(tick, seed, 0.02, jitter * 3) * 40),
    accent: profile.accent,
    summary: profile.summary,
  };
}

function buildSeries(tick: number, now: number, agents: Agent[]): Series {
  const points = 40;
  const stepMs = 45_000;
  const labels: string[] = [];
  const throughput: number[] = [];
  const latency: number[] = [];
  const errors: number[] = [];
  const tokens: number[] = [];

  const baseLoad = agents.reduce((sum, a) => sum + (a.load ?? 0), 0) / agents.length;

  for (let i = points - 1; i >= 0; i--) {
    const t = tick - i * 0.55;
    const ts = now - i * stepMs;
    labels.push(
      new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(ts),
    );
    const macro = wave(t, 1337, 0.09, 0.5);
    throughput.push(Number(Math.max(2, baseLoad * 0.42 + macro * 9 + wave(t, 99, 0.4) * 3).toFixed(2)));
    latency.push(Math.round(clamp(120 + macro * 34 + wave(t, 42, 0.31) * 22, 46, 420)));
    // Synthetic series model a plausible failure floor, not a real error count.
    // The dashboard labels these as simulated so they are never read as truth.
    errors.push(Math.round(clamp(2.4 + wave(t, 771, 0.13, 1.7) * 2.6, 0, 12)));
    tokens.push(Math.round(clamp(3600 + macro * 1400 + wave(t, 555, 0.5) * 700, 400, 12000)));
  }

  return { labels, throughput, latency, errors, tokens, resolutionSec: stepMs / 1000, synthetic: true };
}

function buildHeat(tick: number, agents: Agent[]): HeatCell[] {
  const baseById = new Map(PROFILES.map((p) => [p.id, p.baseLoad]));
  const cells: HeatCell[] = [];
  agents.forEach((agent, ai) => {
    const base = baseById.get(agent.id) ?? 50;
    for (let hour = 0; hour < 12; hour++) {
      const t = tick - (11 - hour) * 2.4;
      const value = clamp(base * 0.5 + wave(t, hash(agent.id) + hour, 0.28, ai) * 26 + (agent.load ?? 0) * 0.42, 4, 100);
      cells.push({ agent: agent.id, hour, load: Math.round(value) });
    }
  });
  return cells;
}

const EVENT_TEMPLATES: Array<{
  kind: EventKind;
  level: EventLevel;
  agent: string;
  title: string;
  detail: string;
}> = [
  {
    kind: "a2a",
    level: "success",
    agent: "default",
    title: "Delegated brief to principal-engineer",
    detail: "a2a_call · scope locked, budget ceiling 42k tokens",
  },
  {
    kind: "task",
    level: "info",
    agent: "frontend",
    title: "Picked up interface parity audit",
    detail: "queue drained from 5 → 3 items",
  },
  {
    kind: "llm",
    level: "info",
    agent: "social-media",
    title: "Drafted 6 channel variants",
    detail: "inkling:free · 3.1k tokens · scored 8.4 avg",
  },
  {
    kind: "gateway",
    level: "success",
    agent: "backend",
    title: "Gateway restart completed",
    detail: "port 9906 · pid 44182 · 1.4s downtime",
  },
  {
    kind: "vault",
    level: "info",
    agent: "management-research",
    title: "Wrote note to Research/competitor-scan.md",
    detail: "notes_write · 1.8 KB · 4 links resolved",
  },
  {
    kind: "error",
    level: "error",
    agent: "backend",
    title: "A2A call to backend timed out",
    detail: "peer did not answer within 120s · retried once",
  },
  {
    kind: "security",
    level: "warn",
    agent: "default",
    title: "OpenRouter quota below threshold",
    detail: "free tier · 41 requests remaining this window",
  },
  {
    kind: "deploy",
    level: "success",
    agent: "principal-engineer",
    title: "Rolled out mesh config revision r21",
    detail: "7 profiles reloaded · 0 drift detected",
  },
  {
    kind: "task",
    level: "success",
    agent: "ceo-bor",
    title: "Stakeholder brief acknowledged",
    detail: "3 approvals collected · 1 pending",
  },
  {
    kind: "llm",
    level: "warn",
    agent: "research",
    title: "Free-tier model returned 402",
    detail: "thinkingmachines/inkling:free · fallback queued",
  },
  {
    kind: "a2a",
    level: "info",
    agent: "ceo-bor",
    title: "Fan-out to 4 peers",
    detail: "social-media, frontend, backend, research",
  },
  {
    kind: "vault",
    level: "success",
    agent: "frontend",
    title: "Linked spec note into project context",
    detail: "vault_analysis · 12 references indexed",
  },
  {
    kind: "gateway",
    level: "warn",
    agent: "default",
    title: "Discord rate limit reached",
    detail: "backoff engaged · retry in 42s",
  },
  {
    kind: "task",
    level: "info",
    agent: "backend",
    title: "Rotated gateway token",
    detail: "peer token refreshed for 2 peers",
  },
  {
    kind: "deploy",
    level: "info",
    agent: "frontend",
    title: "Shipped mesh topology view",
    detail: "bundle 214 KB · 0 lighthouse regressions",
  },
];

export function createEvents(now: number, count = 90): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  let cursor = now - 12_000;

  for (let i = 0; i < count; i++) {
    const rng = mulberry32(i * 2654435761 + 17);
    const template = EVENT_TEMPLATES[Math.floor(rng() * EVENT_TEMPLATES.length)];
    const gap = 18_000 + rng() * 210_000;
    const agentId =
      template.agent === "research" ? "management-research" : template.agent;
    cursor -= gap;
    const durationMs = Math.round(320 + rng() * 8_400);
    const tokens = rng() > 0.45 ? Math.round(400 + rng() * 7_200) : undefined;
    events.push({
      id: `evt-${i}-${Math.round(cursor)}`,
      ts: Math.round(cursor),
      agent: agentId,
      kind: template.kind,
      level: template.level,
      title: template.title,
      detail: template.detail,
      durationMs,
      tokens,
    });
  }

  return events.sort((a, b) => b.ts - a.ts);
}

export function createSnapshot(
  now: number = Date.now(),
  source: MeshSnapshot["source"] = "simulated",
): MeshSnapshot {
  const tick = Math.floor(now / 4_000);
  const agents = PROFILES.map((profile) => buildAgent(profile, tick, now));
  const series = buildSeries(tick, now, agents);
  const heat = buildHeat(tick, agents);

  const online = agents.filter((a) => a.status === "online").length;
  const busy = agents.filter((a) => a.status === "busy").length;
  const degraded = agents.filter((a) => a.status === "degraded").length;
  const offline = agents.filter((a) => a.status === "offline").length;
  const latencies = agents
    .map((a) => a.latencyMs)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const errorRate = series.errors.reduce((sum, v) => sum + v, 0) / series.errors.length;

  return {
    generatedAt: now,
    source,
    agents,
    series,
    heat,
    events: createEvents(now),
    totals: {
      online,
      busy,
      degraded,
      offline,
      tasks: agents.reduce((sum, a) => sum + (a.queue ?? 0), 0),
      tokens: agents.reduce((sum, a) => sum + (a.tokens ?? 0), 0),
      avgLatency:
        latencies.length > 0
          ? Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length)
          : null,
      p95Latency: latencies[Math.floor(latencies.length * 0.95)] ?? null,
      successRate: Number(clamp(100 - errorRate * 3.1, 82, 99.9).toFixed(2)),
      meshLinks: PROFILES.length * (PROFILES.length - 1) / 2,
    },
  };
}

export function meshHealthScore(agents: Agent[], totalLoad: number): number {
  const health = agents.reduce((sum, a) => sum + a.health, 0) / agents.length;
  const pressure = clamp(totalLoad / 70, 0, 1.4);
  return Math.round(clamp(health - pressure * 14 + 4, 0, 100));
}
