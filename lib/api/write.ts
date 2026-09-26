import { reportAuthFailure } from "@/lib/session/auth-state";

/**
 * `fetch` for the write-capable endpoints.
 *
 * Every mutation goes through here so a refused write is noticed once, in one
 * place. Without it each caller had to interpret a bare 401, and the console
 * carried on rendering as though it were signed in.
 */

/** Codes the server uses for reasons the operator must act on. */
export type ApiFailure = {
  code: string;
  error: string;
};

/**
 * Read the server's explanation out of a refused response.
 *
 * The clone matters. `response.json()` consumes the body, and the caller still
 * holds the same `Response` to inspect — so reading it here would leave them
 * with a spent body. The task queue then threw "Body is unusable" and reported
 * "could not reach the review store" for a server it had reached and that had
 * answered with a reason.
 */
async function readFailure(response: Response): Promise<ApiFailure> {
  const body = (await response
    .clone()
    .json()
    .catch(() => ({}))) as Partial<ApiFailure>;
  return {
    code: body.code ?? `http_${response.status}`,
    error: body.error ?? `request failed (${response.status})`,
  };
}

export async function writeJson(
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Response> {
  const { json, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    ...(json === undefined
      ? {}
      : {
          method: rest.method ?? "POST",
          headers: { "content-type": "application/json", ...rest.headers },
          body: JSON.stringify(json),
        }),
  });

  if (!response.ok) {
    const failure = await readFailure(response);
    // `auth_misconfigured` is a 503, the same status the rate limiter and the
    // concurrency ceiling use, so the code is what distinguishes them.
    reportAuthFailure(response.status, failure.code === "auth_misconfigured");
  }

  return response;
}

/** The failure body of a refused write, or `null` when it succeeded. */
export async function writeFailure(response: Response): Promise<ApiFailure | null> {
  return response.ok ? null : readFailure(response);
}
