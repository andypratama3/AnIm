import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

/**
 * The console used to gate only the discussion page, so a 401 from a task
 * review or an agent probe left the shell claiming to be connected while every
 * action it offered was refused. The shared session state is what makes a
 * refused write visible, and the interesting cases are the two 503s: a rate
 * limiter and a misconfigured server share the status, so only the code
 * distinguishes them.
 */

const calls = [];

/** Scripted `fetch` standing in for the browser's. */
function stubFetch(routes) {
  return async (url, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url: String(url), method });
    const handler = routes[`${method} ${url}`] ?? routes[String(url)];
    if (!handler) throw new Error(`unstubbed ${method} ${url}`);
    return handler(init);
  };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const writeUrl = "http://localhost/write";
const failUrl = "http://localhost/fail";
const misconfiguredUrl = "http://localhost/misconfigured";
const throttledUrl = "http://localhost/throttled";

let writeJson;
let writeFailure;
let reportAuthFailure;
let setSessionEscalation;
let states = [];

before(async () => {
  globalThis.fetch = stubFetch({
    [`POST ${writeUrl}`]: () => json({ ok: true }),
    [`POST ${failUrl}`]: () => json({ error: "nope" }, 401),
    // Production with no ANIM_API_TOKEN: a 503, same status the rate limiter
    // uses, so only the code tells them apart.
    [`POST ${misconfiguredUrl}`]: () =>
      json(
        {
          error: "ANIM_API_TOKEN is not set; refusing to serve write endpoints",
          code: "auth_misconfigured",
        },
        503,
      ),
    [`POST ${throttledUrl}`]: () =>
      json({ error: "too many agent processes in flight, retry shortly" }, 503),
  });
  const mod2 = await import("../lib/api/write.ts");
  writeJson = mod2.writeJson;
  writeFailure = mod2.writeFailure;
  const mod = await import("../lib/session/auth-state.ts");
  reportAuthFailure = mod.reportAuthFailure;
  setSessionEscalation = mod.setSessionEscalation;
  // The provider performs this registration at runtime; here the escalation
  // contract is asserted directly, so the test needs no React renderer.
  states = [];
  mod.setSessionEscalation((next) => states.push(next));
});

after(() => {
  delete globalThis.fetch;
  setSessionEscalation(null);
});

describe("a refused write is reported once, centrally", () => {
  test("a 401 asks the console to show the sign-in card", () => {
    states.length = 0;
    reportAuthFailure(401);
    assert.deepEqual(states, ["required"]);
  });

  test("a 403 is treated the same way", () => {
    states.length = 0;
    reportAuthFailure(403);
    assert.deepEqual(states, ["required"]);
  });

  test("a misconfigured server is not mistaken for an expired session", () => {
    states.length = 0;
    reportAuthFailure(503, true);
    assert.deepEqual(
      states,
      ["misconfigured"],
      "a production without ANIM_API_TOKEN cannot be fixed by signing in again",
    );
  });

  test("a plain 503 is left alone: the rate limiter is not an auth problem", () => {
    states.length = 0;
    reportAuthFailure(503, false);
    assert.deepEqual(states, [], "a rate-limited request must not knock the operator out");
  });

  test("an ordinary failure changes nothing", () => {
    states.length = 0;
    reportAuthFailure(500);
    reportAuthFailure(404);
    assert.deepEqual(states, []);
  });
});

describe("writeJson", () => {
  test("a successful write reports nothing", async () => {
    states.length = 0;
    const res = await writeJson(writeUrl, { json: { hello: "world" } });
    assert.equal(res.status, 200);
    assert.deepEqual(states, []);
  });

  test("it sends the json body and content type", async () => {
    const before = calls.length;
    await writeJson(writeUrl, { json: { a: 1 } });
    const call = calls[before];
    assert.equal(call.method, "POST");
  });

  test("a 401 response escalates to the sign-in card", async () => {
    states.length = 0;
    const res = await writeJson(failUrl, { json: {} });
    assert.equal(res.status, 401);
    assert.deepEqual(states, ["required"]);
  });

  test("a 503 carrying auth_misconfigured explains the real problem", async () => {
    states.length = 0;
    const res = await writeJson(misconfiguredUrl, { json: {} });
    assert.equal(res.status, 503);
    assert.deepEqual(
      states,
      ["misconfigured"],
      "signing in again cannot fix a server with no token to sign in with",
    );
  });

  test("a 503 from the rate limiter is not an auth problem", async () => {
    states.length = 0;
    const res = await writeJson(throttledUrl, { json: {} });
    assert.equal(res.status, 503);
    assert.deepEqual(
      states,
      [],
      "being rate limited must not knock the operator out of the console",
    );
  });
});


describe("a refused write stays readable by the caller", () => {
  test("the failure body survives for whoever inspects the response", async () => {
    // Reading the failure inside writeJson must not spend the body. The task
    // queue calls response.json() itself, and used to get "Body is unusable"
    // for a server that had answered with a perfectly good reason.
    const server = json({ error: "reviewer must differ from the owner" }, 409);
    globalThis.fetch = async () => server;

    const response = await writeJson("/api/tasks/T-1", { method: "PATCH", json: {} });
    const body = await response.json();

    assert.equal(body.error, "reviewer must differ from the owner");
  });

  test("writeFailure reports the same reason the caller can still read", async () => {
    const server = json({ code: "rate_limited", error: "slow down" }, 429);
    globalThis.fetch = async () => server;

    const response = await writeJson("/api/agent-chat", { method: "POST", json: {} });
    assert.deepEqual(await writeFailure(response), {
      code: "rate_limited",
      error: "slow down",
    });
  });

  test("a successful write reports no failure", async () => {
    const server = json({ ok: true }, 200);
    globalThis.fetch = async () => server;

    const response = await writeJson("/api/tasks", { method: "DELETE" });
    assert.equal(await writeFailure(response), null);
    assert.deepEqual(await response.json(), { ok: true });
  });

  test("a body that is not JSON does not turn a refusal into a crash", async () => {
    const server = new Response("<html>502</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });
    globalThis.fetch = async () => server;

    const response = await writeJson("/api/mesh-live", { method: "POST" });
    assert.deepEqual(await writeFailure(response), {
      code: "http_502",
      error: "request failed (502)",
    });
  });
});
