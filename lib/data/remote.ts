import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentStatus } from "@/lib/types";

const run = promisify(execFile);

export type RemoteAgent = {
  id: string;
  displayName: string;
  title?: string | null;
  department?: string | null;
  reportsTo?: string | null;
  port: number | null;
  peers: number;
  gateway: "running" | "installed" | "missing";
  gatewayState?: string | null;
  a2aState?: string | null;
  processRunning: boolean;
  portListening: boolean;
  a2aReachable: boolean;
  codeVersion?: string | null;
  agentCard: {
    reachable: boolean;
    name?: string;
    description?: string;
    protocols?: unknown;
    skillCount?: number;
    skills?: string[];
  };
  lifecycle: string;
  skills: string[];
  docs: Record<string, number>;
  hasEnv: boolean;
};

export type RemoteInventory = {
  generatedAt: number;
  host: string;
  hermesRoot: string;
  vaultPath: string;
  vaultDocs: number;
  agents: RemoteAgent[];
  totals: {
    profiles: number;
    running: number;
    installed: number;
    reachable: number;
    withDocs: number;
  };
  collectMs: number;
  readOnly: true;
};

export type RemoteState =
  | { mode: "live"; inventory: RemoteInventory; latencyMs: number }
  | { mode: "unavailable"; reason: string; latencyMs: number };

const HOST = process.env.ANIM_SSH_HOST ?? "root@72.61.141.91";
const TIMEOUT_MS = Number(process.env.ANIM_SSH_TIMEOUT_MS ?? 12_000);
/** Hard output ceiling. A breached ceiling means we refuse the payload. */
const MAX_BYTES = 512 * 1024;

/**
 * Read-only bridge to the Hermes mesh.
 *
 * Security posture:
 *  - the remote command is a fixed literal; nothing user-controlled is interpolated
 *  - no secret is requested: the collector reads only *.md presence, config public
 *    fields, gateway_state.json and the public agent card
 *  - output is size-capped and JSON-parsed defensively
 *  - BatchMode forbids any interactive prompt, so a missing key fails closed
 */
export async function getRemoteInventory(): Promise<RemoteState> {
  if (process.env.ANIM_SSH === "off") {
    return { mode: "unavailable", reason: "ANIM_SSH=off", latencyMs: 0 };
  }

  const started = Date.now();
  const command =
    "HOME=/home/bor timeout 10 python3 /home/bor/.hermes/mesh-inventory.py 2>/dev/null";

  try {
    const { stdout } = await run("ssh", [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=5",
      "-o",
      "StrictHostKeyChecking=accept-new",
      HOST,
      command,
    ], { timeout: TIMEOUT_MS, maxBuffer: MAX_BYTES, encoding: "utf8" });

    const latencyMs = Date.now() - started;
    const trimmed = stdout.trim();
    if (!trimmed) {
      return { mode: "unavailable", reason: "empty collector output", latencyMs };
    }
    if (Buffer.byteLength(trimmed, "utf8") > MAX_BYTES) {
      return { mode: "unavailable", reason: "collector output exceeded cap", latencyMs };
    }

    const parsed = JSON.parse(trimmed) as RemoteInventory;
    if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) {
      return { mode: "unavailable", reason: "collector returned no agents", latencyMs };
    }
    return { mode: "live", inventory: parsed, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const message =
      err instanceof Error && "stderr" in err && typeof err.stderr === "string" && err.stderr
        ? err.stderr.trim().split("\n")[0]
        : err instanceof Error
          ? err.message
          : "unknown ssh failure";
    return { mode: "unavailable", reason: message, latencyMs };
  }
}

const STATUS_BY_STATE: Record<string, AgentStatus> = {
  running: "online",
  // installed but stopped: the profile exists and is wired, but is not serving
  installed: "degraded",
  missing: "offline",
};

export function remoteStatus(agent: RemoteAgent): AgentStatus {
  if (agent.gateway === "running" && agent.portListening) return "online";
  if (agent.gateway === "running" && !agent.portListening) return "degraded";
  if (agent.gateway === "installed") return "degraded";
  return "offline";
}

export function remoteStateLabel(agent: RemoteAgent): string {
  if (agent.gateway === "running" && agent.portListening && agent.a2aReachable) {
    return "A2A live";
  }
  if (agent.gateway === "running" && agent.portListening) return "gateway up, A2A idle";
  if (agent.gateway === "running") return "process up, port closed";
  if (agent.gateway === "installed") return "installed, stopped";
  return "missing";
}

export const REMOTE_STATUS = STATUS_BY_STATE;
