import { z } from "zod";
import { listKanbanTasks, createKanbanTask, completeKanbanTask } from "@/lib/data/hermes-kanban";
import { COLUMNS } from "@/lib/data/board";
import { PROFILES } from "@/lib/data/profiles";
import { checkAuth, checkOrigin, guardHeaders } from "@/lib/security/guard";

const createSchema = z.object({
  title: z.string().min(3).max(120),
  brief: z.string().max(400).default(""),
  priority: z.enum(["critical", "high", "normal", "low"]).default("normal"),
  agent: z.enum(PROFILES.map((p) => p.id) as [string, ...string[]]).default("default"),
  status: z.enum(["backlog", "active", "review", "done"]).default("backlog"),
  tags: z.array(z.string().max(24)).max(6).default([]),
  estimate: z.number().min(0).max(40).default(3),
});

const moveSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["backlog", "active", "review", "done"]),
});

/**
 * The board is Hermes' kanban, read through the shared bridge.
 *
 * It used to answer from an in-process store seeded with sample tasks, which
 * meant the console showed a board nobody was working and lost anything created
 * in it on restart. When the bridge is unavailable the response says so in
 * `source` and returns no tasks — it does not fall back to the sample board,
 * because a plausible-looking board of invented work is worse than an empty one.
 */
export async function GET() {
  const board = await listKanbanTasks();
  if (board.mode === "unavailable") {
    return Response.json(
      {
        tasks: [],
        columns: COLUMNS,
        generatedAt: Date.now(),
        source: "unavailable" as const,
        reason: board.reason,
      },
      { headers: { "cache-control": "no-store, max-age=0" } },
    );
  }
  return Response.json(
    {
      tasks: board.tasks,
      columns: COLUMNS,
      profiles: board.profiles,
      generatedAt: Date.now(),
      source: "live" as const,
    },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  // The board mutates state, so it answers to the same session as everything
  // else. It used to be the one write endpoint that accepted anything at all.
  const origin = checkOrigin(request);
  if (!origin.ok) {
    return Response.json({ error: origin.error }, { status: origin.status, headers: guardHeaders() });
  }
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json(
      { error: auth.error, code: auth.code },
      { status: auth.status, headers: guardHeaders() },
    );
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid task payload", issues: parsed.error.issues }, { status: 400 });
  }
  const created = await createKanbanTask(parsed.data);
  if (!created.ok) {
    return Response.json({ error: created.error }, { status: 502 });
  }
  // Re-read so the response carries the task as Hermes actually stored it,
  // including the id and status the board assigned, rather than echoing input.
  const board = await listKanbanTasks();
  const task =
    board.mode === "live"
      ? (created.id ? board.tasks.find((t) => t.id === created.id) : undefined)
      : undefined;
  return Response.json({ task: task ?? { id: created.id, ...parsed.data }, source: "live" }, { status: 201 });
}

export async function PATCH(request: Request) {
  // The board mutates state, so it answers to the same session as everything
  // else. It used to be the one write endpoint that accepted anything at all.
  const origin = checkOrigin(request);
  if (!origin.ok) {
    return Response.json({ error: origin.error }, { status: origin.status, headers: guardHeaders() });
  }
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json(
      { error: auth.error, code: auth.code },
      { status: auth.status, headers: guardHeaders() },
    );
  }

  const parsed = moveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid move payload" }, { status: 400 });
  }
  // Hermes has no "set status" verb; its dispatcher and workers move tasks
  // through triage/todo/ready/running/review/done on their own. Forwarding an
  // arbitrary column here would write a status the real board does not have and
  // desynchronise the console from what the workers actually see, so only the
  // one transition Hermes supports is honoured and the rest are refused by name.
  if (parsed.data.status !== "done") {
    return Response.json(
      {
        error: "hermes kanban has no verb to set an arbitrary status",
        detail:
          "Hermes advances a task through triage/todo/ready/running/review/done itself. Only \"done\" can be set from the console, via `hermes kanban complete`.",
      },
      { status: 409 },
    );
  }
  const moved = await completeKanbanTask(parsed.data.id);
  if (!moved.ok) {
    // `completeKanbanTask` already reduced the failure to a message string, so
    // passing it through `failureReason` (which expects a thrown error) would
    // collapse a real cause into "unknown transport failure".
    const notFound = /not found|no such|unknown task/i.test(moved.error);
    return Response.json({ error: moved.error }, { status: notFound ? 404 : 502 });
  }
  return Response.json({ ok: true, id: parsed.data.id, status: "done", source: "live" });
}

export async function DELETE(request: Request) {
  // The board mutates state, so it answers to the same session as everything
  // else. It used to be the one write endpoint that accepted anything at all.
  const origin = checkOrigin(request);
  if (!origin.ok) {
    return Response.json({ error: origin.error }, { status: origin.status, headers: guardHeaders() });
  }
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json(
      { error: auth.error, code: auth.code },
      { status: auth.status, headers: guardHeaders() },
    );
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  // Hermes supports archiving, not deleting, and its board is the system of
  // record for work in flight. Removing the row here would only hide it, so the
  // console declines rather than pretend the task no longer exists.
  return Response.json(
    {
      error: "the console does not delete tasks",
      detail:
        "This board is Hermes' own; a task in flight is not the console's to remove. Use `hermes kanban archive` or `hermes kanban complete` on the host.",
    },
    { status: 405 },
  );
}
