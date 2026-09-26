import { chatWithProfile, isChatProfile, CHATTABLE_PROFILES } from "@/lib/data/agent-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 200;

export async function GET() {
  return Response.json({ profiles: CHATTABLE_PROFILES });
}

export async function POST(request: Request) {
  let body: { profile?: unknown; prompt?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }

  const { profile, prompt } = body;
  if (typeof profile !== "string" || !isChatProfile(profile)) {
    return Response.json({ error: "unknown or non-addressable profile" }, { status: 400 });
  }
  if (typeof prompt !== "string") {
    return Response.json({ error: "prompt must be a string" }, { status: 400 });
  }

  const result = await chatWithProfile(profile, prompt);

  if (!result.ok) {
    return Response.json(result, { status: 502 });
  }
  return Response.json(result, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
