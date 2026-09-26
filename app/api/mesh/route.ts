import { getMeshSnapshotLive } from "@/lib/data/live-mesh";

/**
 * The dashboard snapshot.
 *
 * Prefers the real Hermes host through the read-only bridge. When the bridge is
 * unreachable it falls back to the simulated snapshot, and the response says so
 * in `source` plus `reason` so the UI can label it rather than pass it off as
 * measured data.
 */
export async function GET() {
  const result = await getMeshSnapshotLive();

  return Response.json(
    result.mode === "live"
      ? { ...result.snapshot, source: "live", bridge: { mode: "live", latencyMs: result.latencyMs } }
      : {
          ...result.snapshot,
          source: "simulated",
          bridge: { mode: "unavailable", reason: result.reason },
        },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
