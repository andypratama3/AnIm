import { getMeshSnapshot } from "@/lib/data/source";

export async function GET() {
  const snapshot = await getMeshSnapshot();
  return Response.json(snapshot, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
