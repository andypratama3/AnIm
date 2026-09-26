import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { isBridgeUnavailable } from "../scripts/ui-audit.mjs";

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
