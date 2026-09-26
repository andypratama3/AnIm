import { createEvents } from "@/lib/data/engine";
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

  let events = createEvents(Date.now(), 260);

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
    { events: events.slice(0, limit), total: events.length, generatedAt: Date.now() },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
