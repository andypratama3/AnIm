import { chatWithProfile, isChatProfile, CHATTABLE_PROFILES } from "@/lib/data/agent-chat";
import {
  acquireSlot,
  checkAuth,
  checkRateLimit,
  guardHeaders,
  pruneRateLimits,
  releaseSlot,
} from "@/lib/security/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 200;

export async function GET(request: Request) {
  // Profile names are not sensitive, but the route still requires the token so
  // the endpoint surface cannot be enumerated anonymously.
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: guardHeaders() });
  }
  return Response.json({ profiles: CHATTABLE_PROFILES }, { headers: guardHeaders() });
}

export async function POST(request: Request) {
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: guardHeaders() });
  }

  const limit = checkRateLimit(auth.client);
  if (!limit.ok) {
    return Response.json(
      { error: limit.error },
      { status: limit.status, headers: guardHeaders(limit.retryAfterSec) },
    );
  }

  let body: { profile?: unknown; prompt?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400, headers: guardHeaders() });
  }

  const { profile, prompt } = body;
  if (typeof profile !== "string" || !isChatProfile(profile)) {
    return Response.json(
      { error: "unknown or non-addressable profile" },
      { status: 400, headers: guardHeaders() },
    );
  }
  if (typeof prompt !== "string") {
    return Response.json({ error: "prompt must be a string" }, { status: 400, headers: guardHeaders() });
  }

  // One request is one remote process, and each can hold for minutes. Cap the
  // number in flight so a burst cannot pile up processes on the mesh host.
  if (!acquireSlot()) {
    return Response.json(
      { error: "too many agent processes in flight, retry shortly" },
      { status: 503, headers: guardHeaders(15) },
    );
  }

  try {
    const result = await chatWithProfile(profile, prompt);
    if (!result.ok) {
      return Response.json(result, { status: 502, headers: guardHeaders() });
    }
    return Response.json(result, { headers: guardHeaders() });
  } finally {
    releaseSlot();
    if (Math.random() < 0.05) pruneRateLimits();
  }
}
