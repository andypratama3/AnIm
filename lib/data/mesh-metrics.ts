import type { Agent } from "@/lib/types";

/**
 * Roll-ups over live agent metrics.
 *
 * These live apart from the components because the interesting case is the
 * absent one: a live collector that cannot reach a gateway reports `null`
 * rather than `0`, so every roll-up here has to survive being handed nothing
 * but nulls. Averaging those would print a confident `0%` or `0ms` for a mesh
 * nobody measured, which is the exact failure this dashboard is meant to avoid.
 */

/** Mean of the measured hop latencies, or `null` if any hop is unmeasured. */
export function meanLatency(agents: Pick<Agent, "latencyMs">[]): number | null {
  if (agents.length === 0) return null;
  let total = 0;
  for (const agent of agents) {
    if (agent.latencyMs == null) return null;
    total += agent.latencyMs;
  }
  return total / agents.length;
}

/** An agent with a load that was actually measured. */
export type LoadedAgent = { id: string; load: number };

/**
 * The busiest agent, by load, or `null` when no load was measured.
 *
 * Sorting an all-null list still returns its first element, so a naive pick
 * would name a peak that was never observed.
 */
export function hottestAgent(agents: Pick<Agent, "id" | "load">[]): LoadedAgent | null {
  let hottest: LoadedAgent | null = null;
  for (const agent of agents) {
    if (agent.load == null) continue;
    if (hottest === null || agent.load > hottest.load) {
      hottest = { id: agent.id, load: agent.load };
    }
  }
  return hottest;
}

/**
 * Mean of the measured uptime percentages, or `null` unless every agent was
 * measured. A partially-measured mesh is a degraded mesh, and averaging over
 * the subset would present it as healthy.
 */
export function meanUptime(agents: Pick<Agent, "uptimePct">[]): number | null {
  if (agents.length === 0) return null;
  let total = 0;
  for (const agent of agents) {
    if (agent.uptimePct == null) return null;
    total += agent.uptimePct;
  }
  return total / agents.length;
}
