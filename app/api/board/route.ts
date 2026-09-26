import { z } from "zod";
import { addTask, moveTask, removeTask, store } from "@/lib/data/store";
import { COLUMNS } from "@/lib/data/board";
import { PROFILES } from "@/lib/data/profiles";

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
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid task payload", issues: parsed.error.issues }, { status: 400 });
  }
  const task = addTask(parsed.data);
  return Response.json({ task }, { status: 201 });
}

export async function PATCH(request: Request) {
  const parsed = moveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid move payload" }, { status: 400 });
  }
  const task = moveTask(parsed.data.id, parsed.data.status);
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
  return Response.json({ task });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  if (!removeTask(id)) return Response.json({ error: "Task not found" }, { status: 404 });
  return Response.json({ ok: true, id });
}
