import { chatWithProfile, isChatProfile, CHATTABLE_PROFILES } from "@/lib/data/agent-chat";
import { formatHistoryPrompt } from "@/lib/data/chat-history";
import {
  appendMessage,
  clearTranscript,
  newMessage,
  readTranscript,
  type ReplyRef,
} from "@/lib/data/chat-store";
import {
  acquireSlot,
  checkAuth,
  checkOrigin,
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
    return Response.json(
      { error: auth.error, code: auth.code },
      { status: auth.status, headers: guardHeaders() },
    );
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

  const limit = checkRateLimit(auth.client);
  if (!limit.ok) {
    return Response.json(
      { error: limit.error },
      { status: limit.status, headers: guardHeaders(limit.retryAfterSec) },
    );
  }

  let body: { profile?: unknown; prompt?: unknown; replyTo?: unknown };
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
  // A reply reference is display-only. An unrecognisable one is discarded by
  // `newMessage` rather than rejected: the operator still gets their turn sent,
  // it simply will not carry a quote.
  const replyTo = body.replyTo as ReplyRef | undefined;

  // One request is one remote process, and each can hold for minutes. Cap the
  // number in flight so a burst cannot pile up processes on the mesh host.
  if (!acquireSlot()) {
    return Response.json(
      { error: "too many agent processes in flight, retry shortly" },
      { status: 503, headers: guardHeaders(15) },
    );
  }

  // The question is recorded *before* the agent is contacted. The agent call
  // can hold for minutes and the process can die mid-flight, so writing it
  // first is what makes "what was asked" survive. The reply is appended
  // separately when it lands, which means a transcript may legitimately end on
  // an unanswered question, and that gap is real information.
  // Read before recording the question, so the history holds strictly prior
  // turns and the question is not counted twice.
  const prior = await readTranscript(profile);
  const outgoing = newMessage("you", profile, prompt.trim(), { replyTo });
  try {
    await appendMessage(profile, outgoing);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown failure";
    return Response.json(
      { ok: false, profile, error: `could not record the question: ${detail}` },
      { status: 500, headers: guardHeaders() },
    );
  }

  try {
    // The agent gets the earlier turns as context, assembled from the server's
    // own transcript rather than from anything the client sent.
    const result = await chatWithProfile(
      profile,
      formatHistoryPrompt(prior.messages, prompt),
    );

    await appendMessage(
      profile,
      newMessage(
        "agent",
        profile,
        result.ok ? result.reply : `Delivery failed: ${result.error}`,
        { elapsedMs: result.elapsedMs, failed: !result.ok },
      ),
    );
    const transcript = await readTranscript(profile);

    if (!result.ok) {
      return Response.json(
        { ...result, transcript },
        { status: 502, headers: guardHeaders() },
      );
    }
    return Response.json({ ...result, transcript }, { headers: guardHeaders() });
  } catch (err) {
    // A transport-level throw must still leave the failure on record, next to
    // the question that caused it.
    const detail = err instanceof Error ? err.message : "unknown failure";
    try {
      await appendMessage(
        profile,
        newMessage("agent", profile, `Transport error: ${detail}`, { failed: true }),
      );
    } catch {
      // The question is already durable, so losing the error note degrades the
      // record rather than losing it.
    }
    const transcript = await readTranscript(profile);
    return Response.json(
      { ok: false, profile, error: detail, transcript },
      { status: 502, headers: guardHeaders() },
    );
  } finally {
    releaseSlot();
    if (Math.random() < 0.05) pruneRateLimits();
  }
}
