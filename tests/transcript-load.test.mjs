import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createTranscriptLoader,
  transcriptOutcome,
} from "../lib/data/transcript-load.ts";

/**
 * The transcript view is the audit surface. Both bugs it had were the same kind:
 * the screen ended up showing a confident transcript that the data did not
 * support — either another agent's messages under the current agent's name, or
 * a previous log left untouched when the response made no sense.
 */

const turn = (over = {}) => ({
  id: "m1",
  from: "agent",
  profile: "hermes-operator",
  text: "hi",
  ts: 1000,
  ...over,
});

describe("a superseded response must not touch the screen", () => {
  test("starting a second request cancels the first", () => {
    const loader = createTranscriptLoader();
    const first = loader.start();
    const second = loader.start();
    assert.equal(first.signal.aborted, true, "the older request is still in flight");
    assert.equal(second.signal.aborted, false, "the newest request must stay usable");
  });

  test("only the newest controller is current", () => {
    const loader = createTranscriptLoader();
    const first = loader.start();
    const second = loader.start();
    assert.equal(loader.isCurrent(first), false);
    assert.equal(loader.isCurrent(second), true);
  });

  test("a late answer from a cancelled request is ignored", () => {
    const loader = createTranscriptLoader();
    const first = loader.start();
    loader.start();
    const outcome = transcriptOutcome({
      superseded: !loader.isCurrent(first),
      status: 200,
      body: { messages: [turn()], dropped: 0 },
    });
    assert.deepEqual(outcome, { kind: "ignore" });
  });

  test("an ignored response never clears or applies", () => {
    for (const status of [200, 401, 500]) {
      assert.equal(
        transcriptOutcome({ superseded: true, status, body: null }).kind,
        "ignore",
      );
    }
  });

  test("cancelling leaves nothing current, so a late answer cannot land", () => {
    const loader = createTranscriptLoader();
    const controller = loader.start();
    loader.cancel();
    assert.equal(controller.signal.aborted, true);
    assert.equal(loader.isCurrent(controller), false);
  });
});

describe("a response the client cannot read shows nothing", () => {
  test("401 clears the log", () => {
    assert.deepEqual(transcriptOutcome({ superseded: false, status: 401, body: {} }), {
      kind: "clear",
    });
  });

  test("an unrecognised body clears instead of keeping the old log", () => {
    for (const body of [{}, null, "nope", 42, [], { messages: "not-an-array" }]) {
      assert.equal(
        transcriptOutcome({ superseded: false, status: 200, body }).kind,
        "clear",
        `${JSON.stringify(body)} must not leave a stale transcript on screen`,
      );
    }
  });

  test("an error status with a valid-looking body still clears", () => {
    const outcome = transcriptOutcome({
      superseded: false,
      status: 503,
      body: { messages: [turn()], dropped: 0 },
    });
    assert.equal(
      outcome.kind,
      "clear",
      "a bridge failure must not be rendered as an agent transcript",
    );
  });
});

describe("a real transcript is applied verbatim", () => {
  test("messages and the dropped count are carried through", () => {
    const messages = [turn({ from: "you" }), turn({ id: "m2" })];
    assert.deepEqual(
      transcriptOutcome({ superseded: false, status: 200, body: { messages, dropped: 7 } }),
      { kind: "apply", messages, dropped: 7 },
    );
  });

  test("a missing dropped count defaults to zero", () => {
    const outcome = transcriptOutcome({
      superseded: false,
      status: 200,
      body: { messages: [] },
    });
    assert.equal(outcome.kind, "apply");
    assert.equal(outcome.dropped, 0);
  });

  test("an empty transcript is applied, not treated as a failure", () => {
    // An agent that has never been asked anything is genuinely empty. Clearing
    // and applying both empty the screen, but only one of them is truthful
    // about having read the server.
    const outcome = transcriptOutcome({
      superseded: false,
      status: 200,
      body: { messages: [], dropped: 0 },
    });
    assert.equal(outcome.kind, "apply");
    assert.deepEqual(outcome.messages, []);
  });
});
