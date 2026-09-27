import {
  SESSION_COOKIE,
  issueSession,
  sessionEnabled,
  tokenIsValid,
  verifySession,
} from "@/lib/security/session";
import { authMisconfigured, checkOrigin } from "@/lib/security/guard";

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
    {
      authRequired: sessionEnabled(),
      authenticated: verifySession(readCookie(request)),
      // A production deploy with no token cannot accept writes at all. Saying so
      // lets the console explain itself instead of failing every action with an
      // error the operator has no way to fix.
      misconfigured: authMisconfigured(),
    },
    { headers: noStore },
  );
}

/** Exchange the API token for an HttpOnly session cookie. */
export async function POST(request: Request) {
  // Signing in is a state change like any other: a page on another origin
  // should not be able to walk the operator into a session it controls.
  const origin = checkOrigin(request);
  if (!origin.ok) {
    return Response.json({ error: origin.error }, { status: origin.status, headers: noStore });
  }

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
    // "invalid token" is indistinguishable from "you pasted it wrong", and the
    // most common cause by far is a paste that carried the surrounding fence,
    // quote or newline. The response normalizes the obvious cases silently (see
    // `normalizeToken`), so anything still failing here is a genuinely wrong
    // credential — and it now says which, and how to get the right one, instead
    // of leaving the operator to guess. The expected token is never echoed.
    const looksLikePaste = /[`"'\s]/.test(token);
    return Response.json(
      {
        error: "invalid token",
        hint: looksLikePaste
          ? "The submitted value contains spaces or quote characters. Paste the token on its own, with nothing around it."
          : "This is not the configured ANIM_API_TOKEN. Find the first wrong character with: node scripts/token-check.mjs 'what you pasted'",
      },
      { status: 401, headers: noStore },
    );
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
