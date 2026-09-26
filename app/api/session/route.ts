import {
  SESSION_COOKIE,
  issueSession,
  sessionEnabled,
  tokenIsValid,
  verifySession,
} from "@/lib/security/session";

export const dynamic = "force-dynamic";

function readCookie(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

const noStore = { "cache-control": "no-store, max-age=0" };

/** Whether auth is configured, and whether the caller already holds a session. */
export async function GET(request: Request) {
  return Response.json(
    { authRequired: sessionEnabled(), authenticated: verifySession(readCookie(request)) },
    { headers: noStore },
  );
}

/** Exchange the API token for an HttpOnly session cookie. */
export async function POST(request: Request) {
  if (!sessionEnabled()) {
    return Response.json(
      { error: "ANIM_API_TOKEN is not configured on the server" },
      { status: 503, headers: noStore },
    );
  }

  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token === "string") token = body.token.trim();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400, headers: noStore });
  }
  if (!token) {
    return Response.json({ error: "token is required" }, { status: 400, headers: noStore });
  }
  if (!tokenIsValid(token)) {
    return Response.json({ error: "invalid token" }, { status: 401, headers: noStore });
  }

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const response = Response.json({ authenticated: true }, { headers: noStore });
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${issueSession()}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=43200${secure}`,
  );
  return response;
}

export async function DELETE() {
  const response = Response.json({ authenticated: false }, { headers: noStore });
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`,
  );
  return response;
}
