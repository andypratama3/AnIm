import { getRemoteInventory, remoteStatus, remoteStateLabel } from "@/lib/data/remote";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Live mesh read from the Hermes host over SSH.
 *
 * This endpoint is strictly read-only. It exposes gateway/A2A reachability and
 * document presence only: never a token, key, .env value, or file body.
 */
export async function GET() {
  const started = Date.now();
  const remote = await getRemoteInventory();

  if (remote.mode === "unavailable") {
    return Response.json(
      {
        mode: "unavailable",
        reason: remote.reason,
        latencyMs: remote.latencyMs,
        elapsedMs: Date.now() - started,
      },
      {
        status: 503,
        headers: { "cache-control": "no-store, max-age=0" },
      },
    );
  }

  const { inventory } = remote;

  const agents = inventory.agents.map((agent) => ({
    id: agent.id,
    displayName: agent.displayName,
    title: agent.title,
    department: agent.department,
    reportsTo: agent.reportsTo,
    port: agent.port,
    peers: agent.peers,
    gateway: agent.gateway,
    gatewayState: agent.gatewayState,
    a2aState: agent.a2aState,
    a2aReachable: agent.a2aReachable,
    portListening: agent.portListening,
    status: remoteStatus(agent),
    stateLabel: remoteStateLabel(agent),
    codeVersion: agent.codeVersion,
    skillCount: agent.agentCard.skillCount ?? agent.skills.length,
    skills: agent.agentCard.skills?.length ? agent.agentCard.skills : agent.skills,
    docCount: Object.keys(agent.docs).length,
    hasEnv: agent.hasEnv,
  }));

  const departments = new Map<string, number>();
  for (const agent of agents) {
    if (!agent.department) continue;
    departments.set(agent.department, (departments.get(agent.department) ?? 0) + 1);
  }

  return Response.json(
    {
      mode: "live",
      generatedAt: inventory.generatedAt,
      host: inventory.host,
      hermesRoot: inventory.hermesRoot,
      vaultPath: inventory.vaultPath,
      vaultDocs: inventory.vaultDocs,
      collectMs: inventory.collectMs,
      latencyMs: remote.latencyMs,
      elapsedMs: Date.now() - started,
      readOnly: true,
      totals: {
        ...inventory.totals,
        departments: departments.size,
        meshLinksExpected: (inventory.totals.profiles * (inventory.totals.profiles - 1)) / 2,
      },
      agents,
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
