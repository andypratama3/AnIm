import { buildActivityFeed } from "@/lib/data/activity-feed";
import { listTranscripts, readTranscript } from "@/lib/data/chat-store";
import { readStore } from "@/lib/data/task-store";
import type { EventKind, EventLevel } from "@/lib/types";

const KINDS: EventKind[] = ["task", "a2a", "gateway", "vault", "error", "deploy", "llm", "security"];
const LEVELS: EventLevel[] = ["info", "success", "warn", "error"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 120), 400);
  const kind = url.searchParams.get("kind");
  const level = url.searchParams.get("level");
  const agent = url.searchParams.get("agent");
  const query = url.searchParams.get("q")?.toLowerCase().trim();

  // Read the two record sets this dashboard actually keeps. Nothing is
  // generated, so an empty result means nothing has happened yet.
  const [{ tasks }, profiles] = await Promise.all([readStore(), listTranscripts()]);
  const transcripts = await Promise.all(profiles.map((profile) => readTranscript(profile)));
  let events = buildActivityFeed(tasks, transcripts.flatMap((entry) => entry.messages));

  if (kind && KINDS.includes(kind as EventKind)) events = events.filter((e) => e.kind === kind);
  if (level && LEVELS.includes(level as EventLevel)) events = events.filter((e) => e.level === level);
  if (agent) events = events.filter((e) => e.agent === agent);
  if (query) {
    events = events.filter(
      (e) =>
        e.title.toLowerCase().includes(query) ||
        e.detail.toLowerCase().includes(query) ||
        e.agent.includes(query),
    );
  }

  return Response.json(
    {
      events: events.slice(0, limit),
      total: events.length,
      generatedAt: Date.now(),
      // Stated so the client can label the log rather than imply a stream.
      source: { kind: "records", from: ["task history", "chat transcripts"] },
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
