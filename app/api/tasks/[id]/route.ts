import { transition } from "@/lib/data/task-store";
import { checkAuth, guardHeaders } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

/**
 * Move one task along the acceptance ladder.
 *
 * All validation lives in `transition`: the client cannot promote work to
 * VERIFIED, because that requires an actor other than the owner and a prior
 * peer review.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: guardHeaders() });
  }

  const { id } = await params;

  let state: unknown;
  let actor = "";
  let note: string | undefined;
  try {
    const body = (await request.json()) as {
      state?: unknown;
      actor?: unknown;
      note?: unknown;
    };
    state = body.state;
    if (typeof body.actor === "string") actor = body.actor.trim();
    if (typeof body.note === "string") note = body.note.slice(0, 500);
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400, headers: guardHeaders() });
  }

  if (!actor) {
    return Response.json({ error: "actor is required" }, { status: 400, headers: guardHeaders() });
  }

  const result = await transition(id, state, actor, note);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status, headers: guardHeaders() });
  }
  return Response.json(result.task, { headers: guardHeaders() });
}
