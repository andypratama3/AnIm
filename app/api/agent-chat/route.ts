import { chatWithProfile, isChatProfile, CHATTABLE_PROFILES } from "@/lib/data/agent-chat";
import {
  appendExchange,
  clearTranscript,
  newMessage,
  readTranscript,
} from "@/lib/data/chat-store";
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
  // Transcripts hold real agent output, so the same token applies as for sending.
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: guardHeaders() });
  }

  const requested = new URL(request.url).searchParams.get("profile");

  if (requested === null) {
    return Response.json({ profiles: CHATTABLE_PROFILES }, { headers: guardHeaders() });
  }

  if (!isChatProfile(requested)) {
    return Response.json(
      { error: "unknown or non-addressable profile" },
      { status: 400, headers: guardHeaders() },
    );
  }

  const transcript = await readTranscript(requested);
  return Response.json(transcript, { headers: guardHeaders() });
}

/** Drop a profile's history. The operator asked for it, so it is not a loss. */
export async function DELETE(request: Request) {
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: guardHeaders() });
  }

  const requested = new URL(request.url).searchParams.get("profile");
  if (!isChatProfile(requested)) {
    return Response.json(
      { error: "unknown or non-addressable profile" },
      { status: 400, headers: guardHeaders() },
    );
  }

  await clearTranscript(requested);
  return Response.json({ profile: requested, messages: [], dropped: 0 }, { headers: guardHeaders() });
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

  // The question is recorded before the agent is contacted. If the process dies
  // or the operator closes the tab, the transcript still shows what was asked.
  const outgoing = newMessage("you", profile, prompt.trim());

  try {
    const result = await chatWithProfile(profile, prompt);

    const transcript = await appendExchange({
      profile,
      outgoing,
      incoming: newMessage(
        "agent",
        profile,
        result.ok ? result.reply : `Delivery failed: ${result.error}`,
        { elapsedMs: result.elapsedMs, failed: !result.ok },
      ),
    });

    if (!result.ok) {
      return Response.json(
        { ...result, transcript },
        { status: 502, headers: guardHeaders() },
      );
    }
    return Response.json({ ...result, transcript }, { headers: guardHeaders() });
  } catch (err) {
    // A transport-level throw must still leave the question on record.
    const detail = err instanceof Error ? err.message : "unknown failure";
    const transcript = await appendExchange({
      profile,
      outgoing,
      incoming: newMessage("agent", profile, `Transport error: ${detail}`, { failed: true }),
    });
    return Response.json(
      { ok: false, profile, error: detail, transcript },
      { status: 502, headers: guardHeaders() },
    );
  } finally {
    releaseSlot();
    if (Math.random() < 0.05) pruneRateLimits();
  }
}
