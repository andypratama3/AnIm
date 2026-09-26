import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
let canWrite;
let stateFromProbe;
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
  canWrite = mod.canWrite;
  stateFromProbe = mod.stateFromProbe;
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

/**
 * A failed session probe used to `setState("open")`, on the reasoning that
 * "there is nothing to sign in to" when the endpoint is down. The page should
 * still render — that part was right — but `open` also reports `canWrite:
 * true`, so the shell lit up every control the server would then refuse. The
 * state the console is in when it cannot ask is not the state it is in when the
 * answer was yes.
 */
describe("an unanswered session probe is not an open session", () => {
  test("canWrite is false for every state that is not a confirmed open one", () => {
    for (const state of [
      "checking",
      "required",
      "misconfigured",
      "unreachable",
    ]) {
      assert.equal(canWrite(state), false, `${state} must not claim writability`);
    }
    assert.equal(canWrite("open"), true);
  });

  test("a probe that never returns is its own state", () => {
    // The escalation hook is the only path that can set it outside React.
    states.length = 0;
    assert.equal(stateFromProbe({ authRequired: true, authenticated: true }), "open");
    assert.deepEqual(states, [], "a good probe reports nothing");
    assert.notEqual("unreachable", "open", "unreachable exists so these differ");
  });

  test("the shell is read-only rather than walled off, since reads are open", async () => {
    const gate = await readFileSync(
      new URL("../components/dashboard/session-gate.tsx", import.meta.url),
      "utf8",
    );
    const start = gate.indexOf('state === "misconfigured" || state === "unreachable"');
    // Bounded to this branch, or it runs on into the sign-in card below.
    const branch = gate.slice(start, gate.indexOf('state === "required"', start));
    assert.match(branch, /children/, "the console still renders under both");
    assert.match(branch, /session unknown/i, "and it says why the writes are off");
    assert.doesNotMatch(branch, /Sign in/, "no sign-in card: there is nothing to sign in to");
  });

  test("the provider no longer fails open", async () => {
    const provider = await readFileSync(
      new URL("../components/providers/session-provider.tsx", import.meta.url),
      "utf8",
    );
    const start = provider.indexOf("} catch {");
    // Bounded to the catch block rather than a fixed character count, which
    // would cut off mid-comment the next time the explanation is reworded.
    const handler = provider.slice(start, provider.indexOf("}, [refresh])", start));
    // Comments are stripped first: this block's comment names the old behaviour
    // in order to explain the change, and matching prose would fail the test for
    // the wrong reason.
    const code = handler.replace(/\/\/[^\n]*/g, "");
    assert.match(code, /setState\("unreachable"\)/);
    assert.doesNotMatch(code, /setState\("open"\)/);
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
