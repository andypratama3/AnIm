import { execMode, failureReason, runOnMesh } from "@/lib/data/exec-host";
import type { AgentStatus } from "@/lib/types";

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
  probeMs?: number | null;
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

const COLLECTOR = "/home/bor/.hermes/mesh-inventory.py";
const COLLECTOR_HOME = "/home/bor";
const TIMEOUT_MS = Number(process.env.ANIM_SSH_TIMEOUT_MS ?? 12_000);
/** Hard output ceiling. A breached ceiling means we refuse the payload. */
const MAX_BYTES = 512 * 1024;

/**
 * Read-only bridge to the Hermes mesh.
 *
 * Security posture:
 *  - the collector command is a fixed literal; nothing user-controlled is interpolated
 *  - no secret is requested: the collector reads only *.md presence, config public
 *    fields, gateway_state.json and the public agent card
 *  - output is size-capped and JSON-parsed defensively
 *  - the collector runs on whichever host holds the mesh, chosen by
 *    `lib/data/exec-host`; the SSH branch keeps BatchMode so a missing key
 *    fails closed rather than hanging on a prompt
 */
export async function getRemoteInventory(): Promise<RemoteState> {
  if (execMode() === "off") {
    return { mode: "unavailable", reason: "ANIM_EXEC_MODE=off", latencyMs: 0 };
  }

  const started = Date.now();
  const command = `HOME=${COLLECTOR_HOME} timeout 10 python3 ${COLLECTOR} 2>/dev/null`;

  try {
    const { stdout } = await runOnMesh({
      localPaths: [COLLECTOR],
      localArgv: ["python3", COLLECTOR],
      sshCommand: command,
      timeoutMs: TIMEOUT_MS,
      maxBuffer: MAX_BYTES,
      // The collector resolves the mesh root from HOME, so it is set explicitly
      // rather than inherited from whatever account started the server.
      env: { HOME: COLLECTOR_HOME },
    });

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
    return { mode: "unavailable", reason: failureReason(err), latencyMs };
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
