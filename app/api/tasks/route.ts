import { readStore, resetStore } from "@/lib/data/task-store";
import { checkAuth, guardHeaders } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: guardHeaders() });
  }
  const store = await readStore();
  return Response.json(store, { headers: guardHeaders() });
}

/** Restore the seeded queue. Exposed so the demo state can be re-run. */
export async function DELETE(request: Request) {
  const auth = checkAuth(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: guardHeaders() });
  }
  return Response.json(await resetStore(), { headers: guardHeaders() });
}
