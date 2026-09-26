import { z } from "zod";
import { addTask, moveTask, removeTask, store } from "@/lib/data/store";
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

export async function GET() {
  return Response.json(
    { tasks: store().tasks, columns: COLUMNS, generatedAt: Date.now() },
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
  const task = addTask(parsed.data);
  return Response.json({ task }, { status: 201 });
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
  const task = moveTask(parsed.data.id, parsed.data.status);
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  return Response.json({ task });
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
  if (!removeTask(id)) return Response.json({ error: "Task not found" }, { status: 404 });
  return Response.json({ ok: true, id });
}
