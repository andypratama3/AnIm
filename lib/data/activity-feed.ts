import type { ActivityEvent, EventLevel } from "@/lib/types";
import type { Task } from "@/lib/data/task-store";
import type { StoredMessage } from "@/lib/data/chat-store";

/**
 * The activity log, built from records the console actually keeps.
 *
 * This used to be `createEvents(Date.now(), 260)`: two hundred and sixty
 * invented entries, re-seeded from the wall clock on every request, which the
 * activity page then described as "a replayable log of every mesh decision" and
 * badged "streaming". Filters, counts and search all ran convincingly over
 * data that had never happened. The home page and the analytics page render the
 * same feed, so the claim was made in three places.
 *
 * There is no event log on the host to read, so the honest scope is what this
 * dashboard genuinely persists: task transitions and chat transcripts. Gateway
 * restarts, deploys, vault writes and tool calls are not recorded anywhere and
 * therefore do not appear. A short log of real events beats a long one invented.
 *
 * Seed rows are excluded. They exist so the board is not empty on first run, and
 * reporting them as activity would be the same fabrication with extra steps.
 */

const SEED_NOTE = "seeded";

/** How loud a task transition is. */
export function levelForState(state: string): EventLevel {
  if (state === "VERIFIED") return "success";
  if (state === "FAILED") return "error";
  if (state === "BLOCKED") return "warn";
  return "info";
}

function fromTask(task: Task): ActivityEvent[] {
  return task.history
    .filter((entry) => entry.note !== SEED_NOTE)
    .map((entry, index) => ({
      id: `task-${task.id}-${entry.at}-${index}`,
      ts: entry.at,
      // The actor, not the owner: history records who moved it.
      agent: entry.by || task.owner,
      kind: "task" as const,
      level: levelForState(entry.state),
      title: `${task.title} → ${entry.state}`,
      detail: entry.note ?? `${entry.by} moved it to ${entry.state}`,
    }));
}

function fromMessage(message: StoredMessage): ActivityEvent {
  const asked = message.from === "you";
  return {
    // Keyed on the store's own id. Reconstructing one from `ts` collides when
    // two messages land in the same millisecond, which React then treats as one
    // row. `newMessage` uses a UUID precisely so this is unique.
    id: `chat-${message.id}`,
    ts: message.ts,
    agent: message.profile,
    kind: "a2a" as const,
    // A delivery that failed is an error the operator needs to see, not an
    // agent reply that happened to be short.
    level: message.failed ? "error" : asked ? "info" : "success",
    title: asked ? `question sent to ${message.profile}` : `${message.profile} replied`,
    detail: message.failed ? message.text : message.text.slice(0, 160),
    durationMs: message.elapsedMs,
  };
}

/**
 * Newest first.
 *
 * The `limit`/`kind`/`level`/`agent`/`q` filters stay in the route, because
 * filtering a real list is the useful part of that code. Filtering 260 invented
 * events was the illusion.
 */
export function buildActivityFeed(tasks: Task[], messages: StoredMessage[]): ActivityEvent[] {
  return [...tasks.flatMap(fromTask), ...messages.map(fromMessage)].sort(
    (a, b) => b.ts - a.ts,
  );
}
