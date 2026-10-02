import { readStore, resetStore } from "@/lib/data/task-store";
import { checkAuth, checkOrigin, guardHeaders } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json(
      { error: auth.error, code: auth.code },
      { status: auth.status, headers: guardHeaders() },
    );
  }
  const store = await readStore();
  return Response.json(store, { headers: guardHeaders() });
}

/** Clear the review queue. The queue starts empty; this restores that state. */
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
  return Response.json(await resetStore(), { headers: guardHeaders() });
}
