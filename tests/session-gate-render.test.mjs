import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * A misconfigured server must not hide the console.
 *
 * The gate used to return a card and nothing else in that state, so a
 * production deploy with no `ANIM_API_TOKEN` showed an operator a wall instead
 * of the mesh — the reads that still work. The CI layout audit caught it, on
 * the sixteen routes that never rendered, but only after a full push. This
 * fails in a second, locally, on the same rule.
 */

const source = await readFile(
  new URL("../components/dashboard/session-gate.tsx", import.meta.url),
  "utf8",
);

/**
 * The body of the `if (state === "<name>")` block, up to the next branch or to
 * the component's own trailing return. Stopping at the next `if` alone would run
 * the last branch to the end of the file and hand it the `return <>{children}`
 * that belongs to no branch at all.
 */
function branch(name) {
  // Find the branch that *handles* this state, wherever it sits in the
  // condition: `misconfigured` and `unreachable` share one body, and only the
  // first name appears directly after `if (state ===`.
  const opener = /if \(state ===[^)]*\)/g;
  let found = -1;
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    if (match[0].includes(`"${name}"`)) {
      found = match.index;
      break;
    }
  }
  assert.notEqual(found, -1, `the ${name} branch is gone; re-check what replaced it`);
  const rest = source.slice(found);
  const next = rest.slice(1).search(/\n {2}(?:if \(state ===|return )/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("the unreachable state renders the console read-only", () => {
  test("it returns the children, not a wall", () => {
    assert.match(branch("unreachable"), /\{children\}/);
  });

  test("it says the session is unknown rather than blaming the token", () => {
    // The body is shared, so the token sentence legitimately appears in it.
    // What must not happen is the *unreachable* copy offering that diagnosis:
    // no token is missing, the probe simply never answered.
    const body = branch("unreachable");
    const copy = body.slice(body.indexOf(") : (") + 5, body.indexOf(")}"));
    assert.match(copy, /session unknown/i);
    assert.doesNotMatch(copy, /ANIM_API_TOKEN/, "no token is missing; the probe failed");
    assert.match(copy, /Reading the mesh still works/i, "the page is still usable, and says so");
  });

  test("it does not offer a sign-in card", () => {
    // There is nothing to sign in to: the endpoint is not answering. The card
    // is the `required` branch's job.
    assert.doesNotMatch(branch("unreachable"), /<form|Sign in<\/Button>/);
  });

  test("both read-only states share one banner", () => {
    assert.match(
      source,
      /if \(state === "misconfigured" \|\| state === "unreachable"\)/,
      "two states, one honest banner, rather than two copies to drift",
    );
    assert.equal(
      (source.match(/role="status"/g) ?? []).length,
      1,
      "one announcement, and it is the only explanation on screen",
    );
  });
});

describe("the misconfigured state still renders the console", () => {
  test("it returns the children, not a wall", () => {
    assert.match(
      branch("misconfigured"),
      /\{children\}/,
      "a misconfigured server must not replace the app; reads are open by design",
    );
  });

  test("it says the writes are refused rather than implying the page is broken", () => {
    const body = branch("misconfigured");
    assert.match(body, /ANIM_API_TOKEN/);
    assert.match(body, /Writes are disabled/i);
    assert.match(
      body,
      /Reading the mesh still works/i,
      "the copy has to admit the console is usable, since it now is",
    );
  });

  test("it is announced to assistive technology, not just drawn", () => {
    // A warning that only exists visually is invisible to a screen reader, and
    // this one is the only explanation the operator gets.
    assert.match(branch("misconfigured"), /role="status"/);
  });
});

describe("a sign-in wall is still a wall", () => {
  test("required does not render the app behind the form", () => {
    assert.doesNotMatch(
      branch("required"),
      /\{children\}/,
      "a session that is required and absent is the one case that should block",
    );
  });

  test("required offers the form", () => {
    assert.match(branch("required"), /type="password"/);
  });
});

describe("the connected path is untouched", () => {
  test("an open session renders the app plainly", () => {
    assert.match(source, /return <>\{children\}<\/>/);
  });
});
