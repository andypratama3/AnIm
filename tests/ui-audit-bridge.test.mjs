import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { describeError, isBridgeUnavailable, readDeployMode } from "../scripts/ui-audit.mjs";

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
    assert.deepEqual(mode, { misconfigured: true });
  });

  test("a configured deploy is not", async () => {
    const mode = await withFetch(
      async () => new Response(JSON.stringify({ misconfigured: false }), { status: 200 }),
      () => readDeployMode("http://localhost:3000"),
    );
    assert.deepEqual(mode, { misconfigured: false });
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
      assert.deepEqual(mode, { misconfigured: false });
    }
  });
});
