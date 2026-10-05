import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Series } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const HISTORY_PATH = path.join(DATA_DIR, "mesh-history.jsonl");
const MIN_SAMPLE_GAP_MS = 4_000;
const RETAIN_MS = 6 * 60 * 60 * 1000;
const DEFAULT_WINDOW_MS = 30 * 60 * 1000;
const DEFAULT_RESOLUTION_SEC = 30;
const PRUNE_EVERY = 120;

export type MeshSample = {
  ts: number;
  collectMs: number;
  online: number;
  degraded: number;
  offline: number;
  links: number;
  probes: Record<string, number>;
  a2aTotal: number;
  a2aErrors: number;
};

let lastTs = 0;
let appends = 0;

async function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

function quantile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

export async function recordSample(input: Omit<MeshSample, "ts"> & { ts?: number }): Promise<boolean> {
  const ts = input.ts ?? Date.now();
  if (ts - lastTs < MIN_SAMPLE_GAP_MS) return false;
  const sample: MeshSample = { ...input, ts };
  try {
    await ensureDir();
    await appendFile(HISTORY_PATH, `${JSON.stringify(sample)}\n`, "utf8");
    lastTs = ts;
    appends += 1;
    if (appends % PRUNE_EVERY === 0) {
      await prune();
    }
    return true;
  } catch {
    return false;
  }
}

async function prune(): Promise<void> {
  if (!existsSync(HISTORY_PATH)) return;
  try {
    const raw = await readFile(HISTORY_PATH, "utf8");
    const lines = raw.trim().split("\n");
    const cutoff = Date.now() - RETAIN_MS;
    const filtered = lines
      .map((l) => {
        try {
          const parsed = JSON.parse(l) as { ts?: unknown };
          return { l, ts: typeof parsed.ts === "number" ? parsed.ts : 0 };
        } catch {
          return { l, ts: 0 };
        }
      })
      .filter(({ ts }) => ts > cutoff)
      .map(({ l }) => l);
    if (filtered.length !== lines.length) {
      await ensureDir();
      await writeFile(HISTORY_PATH, `${filtered.join("\n")}\n`, "utf8");
    }
  } catch {
    // ignore
  }
}

export async function readSamples(): Promise<MeshSample[]> {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    const raw = await readFile(HISTORY_PATH, "utf8");
    const out: MeshSample[] = [];
    for (const line of raw.trim().split("\n")) {
      if (!line) continue;
      try {
        out.push(JSON.parse(line) as MeshSample);
      } catch {
        // skip malformed line
      }
    }
    return out.sort((a, b) => a.ts - b.ts);
  } catch {
    return [];
  }
}

function bucketStart(ts: number, resolutionSec: number): number {
  return Math.floor(ts / (resolutionSec * 1000)) * resolutionSec * 1000;
}

export type BuiltSeries = Series & { p95: Array<number | null>; collectMs: number[] };

export function buildSeries(
  samples: MeshSample[],
  windowMs = DEFAULT_WINDOW_MS,
  resolutionSec = DEFAULT_RESOLUTION_SEC,
): BuiltSeries {
  const cutoff = Date.now() - windowMs;
  const recent = samples.filter((s) => s.ts >= cutoff);
  if (!recent.length) {
    return {
      labels: [],
      throughput: [],
      latency: [],
      errors: [],
      tokens: [],
      resolutionSec,
      synthetic: false,
      p95: [],
      collectMs: [],
      tokensMeasured: false,
    };
  }

  const buckets = new Map<number, {
    collect: number[];
    probes: number[];
    exchangesDelta: number;
    errorsDelta: number;
    start: number;
    end: number;
  }>();

  for (let i = 0; i < recent.length; i++) {
    const cur = recent[i];
    const prev = i > 0 ? recent[i - 1] : null;
    const start = bucketStart(cur.ts, resolutionSec);
    const key = start;
    const bucket = buckets.get(key) || {
      collect: [],
      probes: [],
      exchangesDelta: 0,
      errorsDelta: 0,
      start,
      end: start + resolutionSec * 1000,
    };
    bucket.collect.push(cur.collectMs);
    for (const v of Object.values(cur.probes)) {
      if (typeof v === "number" && Number.isFinite(v)) bucket.probes.push(v);
    }
    if (prev) {
      const ed = cur.a2aTotal - prev.a2aTotal;
      const erd = cur.a2aErrors - prev.a2aErrors;
      if (ed > 0) bucket.exchangesDelta += ed;
      if (erd > 0) bucket.errorsDelta += erd;
    }
    buckets.set(key, bucket);
  }

  const bucketStarts = Array.from(buckets.keys()).sort((a, b) => a - b);
  const labels = bucketStarts.map((s) =>
    new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  );
  const throughput = bucketStarts.map((s) => {
    const b = buckets.get(s)!;
    return Math.max(0, b.exchangesDelta / resolutionSec);
  });
  const latency = bucketStarts.map((s) => {
    const b = buckets.get(s)!;
    // Mean agent round trip, not the collector's own runtime. The two were
    // plotted on one axis, which made the p95 overlay sit an order of magnitude
    // below the line it was supposed to bound. `collectMs` is a real
    // measurement of a different thing and is reported separately below.
    const avg = b.probes.length ? b.probes.reduce((x, y) => x + y, 0) / b.probes.length : 0;
    return avg;
  });
  const collectMs = bucketStarts.map((s) => {
    const b = buckets.get(s)!;
    return b.collect.length ? b.collect.reduce((x, y) => x + y, 0) / b.collect.length : 0;
  });
  const errors = bucketStarts.map((s) => {
    const b = buckets.get(s)!;
    return Math.max(0, b.errorsDelta);
  });
  const p95 = bucketStarts.map((s) => {
    const b = buckets.get(s)!;
    if (!b.probes.length) return null;
    const sorted = b.probes.slice().sort((a, b) => a - b);
    return quantile(sorted, 0.95);
  });

  return {
    labels,
    throughput,
    latency,
    errors,
    tokens: [],
    resolutionSec,
    synthetic: false,
    p95,
    collectMs,
    tokensMeasured: false,
  };
}

export function perAgentSeries(
  agentIds: string[],
  entries: Array<{ ts: number; peer: string; summary: string }>,
  windowMs = DEFAULT_WINDOW_MS,
  resolutionSec = DEFAULT_RESOLUTION_SEC,
): Record<string, number[]> {
  const cutoff = Date.now() - windowMs;
  const recent = entries.filter((e) => e.ts >= cutoff);
  if (!recent.length) return Object.fromEntries(agentIds.map((id) => [id, []]));
  const buckets = new Map<number, Record<string, number>>();
  for (const e of recent) {
    if (!agentIds.includes(e.peer)) continue;
    const start = bucketStart(e.ts, resolutionSec);
    if (!buckets.has(start)) {
      buckets.set(start, Object.fromEntries(agentIds.map((id) => [id, 0])));
    }
    buckets.get(start)![e.peer]++;
  }
  const starts = Array.from(buckets.keys()).sort((a, b) => a - b);
  return Object.fromEntries(
    agentIds.map((id) => [id, starts.map((s) => buckets.get(s)![id])]),
  );
}

export function windowTotals(
  samples: MeshSample[],
  windowMs = DEFAULT_WINDOW_MS,
): {
  avgLatency: number | null;
  p95Latency: number | null;
  successRate: number | null;
  collectMs: number | null;
} {
  const cutoff = Date.now() - windowMs;
  const recent = samples.filter((s) => s.ts >= cutoff);
  if (!recent.length) {
    return { avgLatency: null, p95Latency: null, successRate: null, collectMs: null };
  }
  const collects = recent.map((s) => s.collectMs);
  const probes = recent.flatMap((s) =>
    Object.values(s.probes).filter((v) => typeof v === "number" && Number.isFinite(v)),
  );
  // Both figures describe the same population: per-agent gateway round trips.
  // They used to be computed over different ones - the mean over the
  // collector's whole run, the p95 over the probes - which reported a p95 far
  // below the average and made the pair unreadable. The collector's own runtime
  // is real, so it is reported as its own number instead of masquerading as
  // agent latency.
  const sorted = probes.slice().sort((a, b) => a - b);
  const avgLatency = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null;
  const p95Latency = quantile(sorted, 0.95);
  const collectMs = collects.length
    ? collects.reduce((a, b) => a + b, 0) / collects.length
    : null;
  let successRate: number | null = null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (last.a2aTotal >= first.a2aTotal) {
    const ex = last.a2aTotal - first.a2aTotal;
    const er = last.a2aErrors - first.a2aErrors;
    if (ex > 0) {
      successRate = Math.max(0, 100 * (1 - er / ex));
    }
  }
  return { avgLatency, p95Latency, successRate, collectMs };
}
