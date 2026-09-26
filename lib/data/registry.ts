import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The agent registry is the single source of truth for which port a profile
 * listens on.
 *
 * It used to be duplicated in two places in code, and the copies had already
 * drifted apart: `remote-probe.ts` claimed `frontend` was on 9907 while the
 * registry said 9905, which meant a live agent was probed on a dead port and
 * reported offline. The live seven are the ones the registry has ports for;
 * the nineteen new profiles have no port assigned yet, and this module reports
 * that honestly instead of guessing one.
 */

export type RegistryAgent = {
  id: string;
  display_name?: string;
  profile?: string;
  state?: string;
  port?: number;
  department?: string;
  reports_to?: string;
  title?: string;
};

export type Registry = {
  agents: RegistryAgent[];
};

let cached: Registry | null = null;

function registryPath(): string {
  return path.join(process.cwd(), "agents", "registry.json");
}

export function readRegistry(): Registry {
  if (cached) return cached;
  const parsed = JSON.parse(readFileSync(registryPath(), "utf8")) as Registry;
  if (!Array.isArray(parsed.agents)) {
    throw new Error("agents/registry.json has no agents array");
  }
  cached = parsed;
  return parsed;
}

/**
 * The port a profile listens on, or `null` when the registry has not assigned
 * one. `null` is a real answer: probing an unassigned port would report a
 * connection failure that looks like an outage.
 */
export function portForProfile(profile: string): number | null {
  const agent = readRegistry().agents.find((a) => a.id === profile);
  const port = agent?.port;
  return typeof port === "number" && Number.isInteger(port) ? port : null;
}

/** Profiles that have a port assigned, i.e. the ones a probe can reach. */
export function probeableProfiles(): string[] {
  return readRegistry()
    .agents.filter((a) => typeof a.port === "number")
    .map((a) => a.id);
}
