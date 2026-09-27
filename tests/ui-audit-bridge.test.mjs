import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  describeError,
  INTERACTIONS,
  isBridgeUnavailable,
  READY_TIMEOUT_MS,
  readDeployMode,
  resolveToken,
  ROUTES,
  signIn,
  waitForHeading,
} from "../scripts/ui-audit.mjs";

/**
 * The live bridge answers 503 when the agent host is unreachable, and the UI is
 * built to show that as a labelled degraded state. The audit therefore has to
 * tolerate exactly that one failure and nothing else.
 *
 * The two ways to get this wrong are both covered below: whitelisting any error
 * whose text happens to contain "503" (which hides a real outage on another
 * endpoint), and trusting a status that the log entry never actually carried
 * (which makes the whitelist silently dead).
 */
const entry = (over = {}) => ({
  text: "Failed to load resource: the server responded with a status of 503",
  url: "http://127.0.0.1:3000/api/mesh-live",
  status: 503,
  ...over,
});

describe("live-bridge 503 whitelist", () => {
  test("a real 503 on the bridge is the expected degraded state", () => {
    assert.equal(isBridgeUnavailable(entry()), true);
  });

  test("the query string does not hide a bridge 503", () => {
    assert.equal(
      isBridgeUnavailable(entry({ url: "http://127.0.0.1:3000/api/mesh-live?full=1" })),
      true,
    );
  });

  test("a 503 on any other endpoint is a real failure", () => {
    assert.equal(
      isBridgeUnavailable(entry({ url: "http://127.0.0.1:3000/api/mesh" })),
      false,
      "another endpoint returning 503 must fail the audit",
    );
    assert.equal(
      isBridgeUnavailable(entry({ url: "http://127.0.0.1:3000/api/agent-chat" })),
      false,
    );
  });

  test("a bridge failure with a different status is a real failure", () => {
    for (const status of [500, 502, 504, 401, 403, 404]) {
      assert.equal(
        isBridgeUnavailable(entry({ status })),
        false,
        `bridge status ${status} is a defect, not the expected degraded mode`,
      );
    }
  });

  test("prose mentioning 503 cannot buy a pass", () => {
    // A genuine bug whose message merely cites the number 503 must still fail.
    assert.equal(
      isBridgeUnavailable(
        entry({ url: "http://127.0.0.1:3000/api/mesh", status: 200 }),
      ),
      false,
    );
    assert.equal(
      isBridgeUnavailable(
        entry({
          url: "http://127.0.0.1:3000/api/mesh",
          status: 500,
          text: "expected 503 from mesh-live but got this",
        }),
      ),
      false,
    );
  });

  test("a missing status is not treated as a bridge 503", () => {
    // `Log.entryAdded` carries no HTTP status, so if the Network-domain lookup
    // failed the entry stays unknown. Unknown must fail loudly, not pass quietly.
    assert.equal(isBridgeUnavailable(entry({ status: undefined })), false);
    assert.equal(isBridgeUnavailable({ url: "http://x/api/mesh-live" }), false);
  });

  test("the status is compared as a number, not a string", () => {
    assert.equal(
      isBridgeUnavailable(entry({ status: "503" })),
      false,
      "a stringified status means the lookup did not run; do not pass it",
    );
  });

  test("an unrelated console error is never whitelisted", () => {
    assert.equal(
      isBridgeUnavailable({ text: "ResizeObserver loop limit exceeded", url: "", status: 503 }),
      false,
    );
  });
});

/**
 * The audit crashed while printing its own failures.
 *
 * A console entry is `{ text, url, status }`, but the summary called
 * `.slice()` on it as if it were a string. `e.slice is not a function` took the
 * process down on the very run that had errors to report, so CI showed a
 * TypeError instead of the three console errors on /discussion that were the
 * actual finding.
 */
describe("a captured console error can always be printed", () => {
  test("a structured entry renders with its status and url", () => {
    const line = describeError({
      text: "Failed to load resource: the server responded with a status of 503",
      url: "http://localhost:3000/api/mesh-live",
      status: 503,
    });
    assert.match(line, /503/);
    assert.match(line, /\/api\/mesh-live/);
  });

  test("a plain string still works", () => {
    assert.equal(describeError("boom"), "boom");
  });

  test("missing fields do not throw", () => {
    // The whole point: printing must never be the thing that fails.
    for (const bad of [null, undefined, {}, { text: undefined }, { text: "x" }]) {
      assert.doesNotThrow(() => describeError(bad), `${JSON.stringify(bad)} must not throw`);
    }
  });

  test("a very long error is truncated", () => {
    assert.ok(describeError({ text: "x".repeat(5000) }).length <= 200);
  });
});

/**
 * A deploy with no token refuses guarded endpoints on purpose.
 *
 * Once the console stopped hiding behind that warning, /discussion actually
 * rendered — and its `/api/agent-chat` and `/api/tasks` fetches came back 503,
 * which is the guard working, not a broken page. The audit has to know which
 * mode the server is in rather than holding a list of endpoints that may
 * 503, because the next guarded route would then fail CI for behaving as
 * designed.
 */
describe("the audit tells a deliberate refusal from a real outage", () => {
  const refusal = { url: "http://localhost:3000/api/tasks", status: 503, text: "" };
  const outage = { url: "http://localhost:3000/api/notes", status: 500, text: "" };
  const bridge = { url: "http://localhost:3000/api/mesh-live", status: 503, text: "" };

  test("a guarded 503 counts as expected on a misconfigured deploy", () => {
    assert.equal(isBridgeUnavailable(refusal, { misconfigured: true }), true);
  });

  test("the same 503 is a defect on a configured deploy", () => {
    assert.equal(isBridgeUnavailable(refusal, { misconfigured: false }), false);
    assert.equal(isBridgeUnavailable(refusal), false);
  });

  test("the bridge is expected either way", () => {
    assert.equal(isBridgeUnavailable(bridge, { misconfigured: false }), true);
    assert.equal(isBridgeUnavailable(bridge, { misconfigured: true }), true);
  });

  test("a 500 is never an expected degradation", () => {
    assert.equal(isBridgeUnavailable(outage, { misconfigured: true }), false);
  });

  test("misconfigured does not excuse a non-503", () => {
    for (const status of [400, 401, 404, 500, 502]) {
      assert.equal(isBridgeUnavailable({ ...refusal, status }, { misconfigured: true }), false);
    }
  });

  test("it does not excuse a non-API request", () => {
    const asset = { url: "http://localhost:3000/_next/static/chunk.js", status: 503 };
    assert.equal(isBridgeUnavailable(asset, { misconfigured: true }), false);
  });

  test("a malformed entry is not an expected degradation", () => {
    for (const bad of [null, undefined, {}, { status: 503 }, { url: "x" }]) {
      assert.equal(isBridgeUnavailable(bad, { misconfigured: true }), false);
    }
  });
});

describe("waiting for a page to render", () => {
  // No real timers: a fake clock keeps these instant and keeps the timeout
  // assertion honest instead of relying on wall-clock scheduling.
  const fakeClock = () => {
    let now = 0;
    return {
      now: () => now,
      delay: async (ms) => {
        now += ms;
      },
      advance: (ms) => {
        now += ms;
      },
    };
  };

  test("it returns as soon as the heading paints", async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await waitForHeading(
      () => (++calls >= 3 ? "Mesh overview" : ""),
      { timeoutMs: 5000, intervalMs: 100, delay: clock.delay },
    );
    assert.equal(result.ready, true);
    assert.equal(result.heading, "Mesh overview");
    assert.equal(calls, 3, "it should stop polling the moment the heading is there");
  });

  test("an immediate page costs one probe and no waiting", async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await waitForHeading(
      () => {
        calls += 1;
        return "Agents";
      },
      { timeoutMs: 5000, intervalMs: 100, delay: clock.delay },
    );
    assert.equal(result.ready, true);
    assert.equal(calls, 1);
  });

  test("a page that never renders reports not-ready instead of hanging", async () => {
    const clock = fakeClock();
    const result = await waitForHeading(() => "", {
      timeoutMs: 1000,
      intervalMs: 100,
      delay: clock.delay,
    });
    assert.equal(result.ready, false);
    assert.ok(result.waitedMs >= 1000, `gave up after ${result.waitedMs}ms, expected at least the timeout`);
  });

  test("an evaluation that throws mid-navigation keeps polling", async () => {
    const clock = fakeClock();
    let calls = 0;
    const result = await waitForHeading(
      () => {
        calls += 1;
        if (calls < 3) throw new Error("Cannot find context with specified id");
        return "Settings";
      },
      { timeoutMs: 5000, intervalMs: 100, delay: clock.delay },
    );
    assert.equal(result.ready, true, "a transient evaluation error is not a page that failed to render");
    assert.equal(calls, 3);
  });

  test("whitespace is not a heading", async () => {
    const clock = fakeClock();
    const result = await waitForHeading(() => "   ", {
      timeoutMs: 300,
      intervalMs: 100,
      delay: clock.delay,
    });
    assert.equal(result.ready, false);
  });

  test("the default timeout is long enough for a cold production server", () => {
    // It replaced a flat 3.2s sleep that was too short on a cold start, so the
    // replacement has to actually be longer than what it replaced.
    assert.ok(READY_TIMEOUT_MS >= 5_000, `READY_TIMEOUT_MS=${READY_TIMEOUT_MS} is not a real wait`);
  });
});

/**
 * The interaction spec is written, not run — but it is quoted as coverage in
 * `docs/screenshots/*.md` and in `docs/DASHBOARD.md`, so a route added without
 * an entry would leave the docs claiming a control the spec never recorded.
 */
describe("the interaction spec matches the audited routes", () => {
  test("every audited route has at least one recorded interaction", () => {
    for (const route of ROUTES) {
      const recorded = INTERACTIONS[route];
      assert.ok(
        Array.isArray(recorded) && recorded.length > 0,
        `${route} is audited but records no interaction; the docs would claim coverage that does not exist`,
      );
    }
  });

  test("no route is recorded that is not audited", () => {
    for (const route of Object.keys(INTERACTIONS)) {
      assert.ok(ROUTES.includes(route), `${route} is recorded but never audited`);
    }
  });
});

describe("the audit asks the server which mode it is in", () => {
  const withFetch = async (impl, run) => {
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    try {
      return await run();
    } finally {
      globalThis.fetch = original;
    }
  };

  test("a deploy that reports misconfigured is recognised", async () => {
    const mode = await withFetch(
      async () => new Response(JSON.stringify({ misconfigured: true }), { status: 200 }),
      () => readDeployMode("http://localhost:3000"),
    );
    assert.equal(mode.misconfigured, true);
  });

  test("a configured deploy is not", async () => {
    const mode = await withFetch(
      async () => new Response(JSON.stringify({ misconfigured: false }), { status: 200 }),
      () => readDeployMode("http://localhost:3000"),
    );
    assert.equal(mode.misconfigured, false);
  });

  test("the mode also reports whether a session is needed and held", async () => {
    // The audit has to sign in before it can measure a route: a deploy with a
    // token puts the sign-in card in front of every page until the browser holds
    // a session, so an audit that only learned `misconfigured` would measure a
    // login form sixteen times.
    const mode = await withFetch(
      async () =>
        new Response(JSON.stringify({ misconfigured: false, authRequired: true, authenticated: false }), {
          status: 200,
        }),
      () => readDeployMode("http://localhost:3000"),
    );
    assert.equal(mode.authRequired, true, "a token is configured, so a session is required");
    assert.equal(mode.authenticated, false, "and this browser holds none yet");
  });

  test("a deploy with no token needs no session", async () => {
    const mode = await withFetch(
      async () => new Response(JSON.stringify({ misconfigured: false, authRequired: false }), { status: 200 }),
      () => readDeployMode("http://localhost:3000"),
    );
    assert.equal(mode.authRequired, false, "nothing to sign in to; the audit runs unauthenticated");
  });

  test("a lying or unreachable session endpoint keeps the audit strict", async () => {
    // Assuming "misconfigured" when the server never said so would excuse every
    // 503 in the run. The safe answer when the mode is unknown is "not
    // misconfigured", so real outages still fail.
    for (const impl of [
      async () => {
        throw new Error("ECONNREFUSED");
      },
      async () => new Response("not json", { status: 502 }),
      async () => new Response(JSON.stringify({ misconfigured: "yes" }), { status: 200 }),
    ]) {
      const mode = await withFetch(impl, () => readDeployMode("http://localhost:3000"));
      assert.equal(mode.misconfigured, false);
      // An unknown mode must not be mistaken for "a session is required",
      // because that would send the audit looking for a token it may not have.
      assert.equal(mode.authRequired, false);
      assert.equal(mode.authenticated, false);
    }
  });
});

describe("the audit signs in when the deploy needs a session", () => {
  const cookieResponse = (extraHeaders = {}) =>
    new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
      headers: { "content-type": "application/json", ...extraHeaders },
    });

  test("it exchanges the token for the session cookie value", async () => {
    const original = globalThis.fetch;
    let sent = null;
    globalThis.fetch = async (url, init) => {
      sent = { url: String(url), body: init?.body };
      return cookieResponse({
        "set-cookie": "anim_session=abc.def; HttpOnly; SameSite=Strict; Path=/api; Max-Age=43200",
      });
    };
    try {
      const value = await signIn("http://localhost:3000", "s3cret");
      assert.equal(value, "abc.def", "attributes are stripped; only the value is planted");
      assert.match(sent.url, /\/api\/session$/);
      assert.deepEqual(JSON.parse(sent.body), { token: "s3cret" });
    } finally {
      globalThis.fetch = original;
    }
  });

  test("a refused token stops the audit instead of measuring a login form", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response("nope", { status: 401 });
    try {
      await assert.rejects(
        () => signIn("http://localhost:3000", "wrong"),
        /sign-in refused with 401/,
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  test("a response with no cookie is an error, not an empty session", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => cookieResponse();
    try {
      await assert.rejects(() => signIn("http://localhost:3000", "s3cret"), /no session cookie/);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("no token means no sign-in attempt", async () => {
    // A deploy without a token needs no session, and calling the login route
    // anyway would turn a healthy run into a failure.
    assert.equal(await signIn("http://localhost:3000", ""), "");
  });

  test("the token is read from the environment or the local runtime env file", () => {
    const original = process.env.ANIM_API_TOKEN;
    try {
      process.env.ANIM_API_TOKEN = "from-env";
      assert.equal(resolveToken(), "from-env");
    } finally {
      if (original === undefined) delete process.env.ANIM_API_TOKEN;
      else process.env.ANIM_API_TOKEN = original;
    }
    // The repo ships no committed token, and `.env.local` is gitignored, so with
    // nothing in the environment the audit must find nothing rather than fail
    // deep inside a fetch. It reports that it cannot audit, which is actionable.
    assert.equal(typeof resolveToken(), "string");
  });
});
