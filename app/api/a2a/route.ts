import { readA2AAudit } from "@/lib/data/hermes-a2a";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "cache-control": "no-store, max-age=0" };

/**
 * Real A2A traffic for the discussion panel: the tail of the Hermes audit
 * log on this host (peer, direction, task id, summary per exchange).
 * Read-only and unauthenticated — the log holds no secrets, only routing
 * metadata. Empty means no exchanges recorded, not a silent failure.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const peer = url.searchParams.get("peer");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 60), 120);

  const state = await readA2AAudit();
  if (state.mode === "unavailable") {
    return Response.json(
      { entries: [], total: 0, mode: "unavailable", reason: state.reason },
      { headers: noStore },
    );
  }

  let entries = state.entries;
  if (peer) entries = entries.filter((entry) => entry.peer === peer);

  return Response.json(
    {
      entries: entries.slice(-limit).reverse(),
      total: state.total,
      mode: "live",
      latencyMs: state.latencyMs,
    },
    { headers: noStore },
  );
}
