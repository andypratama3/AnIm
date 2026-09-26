import { isProbeProfile, probeAgent } from "@/lib/data/remote-probe";
import {
  checkAuth,
  checkOrigin,
  checkRateLimit,
  guardHeaders,
  pruneRateLimits,
} from "@/lib/security/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Measure a real round trip to one agent.
 *
 * Guarded by the same auth and rate limit as chat: the probe spawns a remote
 * process, so an open endpoint would let anyone make the mesh host fork python
 * on demand.
 */
export async function POST(request: Request) {
  const origin = checkOrigin(request);
  if (!origin.ok) {
    return Response.json(
      { error: origin.error },
      { status: origin.status, headers: guardHeaders() },
    );
  }
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json(
      { error: auth.error, code: auth.code },
      { status: auth.status, headers: guardHeaders() },
    );
  }

  const limit = checkRateLimit(`probe:${auth.client}`);
  if (!limit.ok) {
    return Response.json(
      { error: limit.error },
      { status: limit.status, headers: guardHeaders(limit.retryAfterSec) },
    );
  }

  let profile = "";
  try {
    const body = (await request.json()) as { profile?: unknown };
    if (typeof body.profile === "string") profile = body.profile.trim();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400, headers: guardHeaders() });
  }

  if (!isProbeProfile(profile)) {
    return Response.json(
      { error: "unknown or non-addressable profile" },
      { status: 400, headers: guardHeaders() },
    );
  }

  const result = await probeAgent(profile);
  if (Math.random() < 0.05) pruneRateLimits();
  return Response.json(result, { headers: guardHeaders() });
}
