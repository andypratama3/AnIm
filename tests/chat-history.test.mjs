import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_HISTORY_TURNS,
  MAX_TURN_CHARS,
  formatHistoryPrompt,
  historyTurnCount,
} from "@/lib/data/chat-history";
import { MAX_PROMPT_CHARS } from "@/lib/data/agent-chat";

/**
 * Every turn used to be a single question handed to a single remote process, so
 * the agent was amnesiac between messages while the transcript was durable: the
 * dashboard remembered, the agent did not. These tests pin the two things that
 * matter about the fix — that the question always survives, and that the prompt
 * can never exceed the wire limit, whatever the transcript looks like.
 */

function msg(overrides) {
  return { id: "m", from: "agent", profile: "frontend", text: "ok", ts: 1, ...overrides };
}

describe("a question with nothing before it is unchanged", () => {
  test("first question sends exactly what was typed", () => {
    assert.equal(formatHistoryPrompt([], "why is the build red?"), "why is the build red?");
  });

  test("history that is only failures carries nothing", () => {
    // A failed turn's text is "Delivery failed: ...", which tells the agent
    // nothing and spends budget a real turn needed.
    const history = [msg({ text: "Delivery failed: timeout", failed: true })];
    assert.equal(formatHistoryPrompt(history, "and now?"), "and now?");
  });

  test("blank turns are skipped rather than sent as empty lines", () => {
    const history = [msg({ from: "you", text: "   " }), msg({ text: "" })];
    assert.equal(formatHistoryPrompt(history, "hello"), "hello");
  });
});

describe("prior turns reach the agent", () => {
  test("a question and its answer are both in the prompt", () => {
    const prompt = formatHistoryPrompt(
      [msg({ from: "you", text: "what broke?" }), msg({ text: "the type import" })],
      "fix it",
    );
    assert.match(prompt, /You: what broke\?/);
    assert.match(prompt, /frontend: the type import/);
    assert.match(prompt, /fix it$/, "the question is last, so it reads as the live ask");
    assert.equal(historyTurnCount(prompt), 2);
  });

  test("older turns are dropped before newer ones", () => {
    const history = Array.from({ length: 20 }, (_, i) =>
      msg({ from: "you", text: `question ${i}` }),
    );
    const prompt = formatHistoryPrompt(history, "latest");
    assert.match(prompt, /question 19/, "the most recent turn is kept");
    assert.doesNotMatch(prompt, /question 1\b/, "the oldest is trimmed first");
    assert.ok(historyTurnCount(prompt) <= MAX_HISTORY_TURNS);
  });

  test("one enormous reply is trimmed, not allowed to swallow the budget", () => {
    const prompt = formatHistoryPrompt([msg({ text: "x".repeat(20_000) })], "and now?");
    assert.match(prompt, /…/);
    assert.ok(prompt.length <= MAX_PROMPT_CHARS);
    assert.ok(
      prompt.includes("x".repeat(10)),
      "most of the reply is still there, just not all of it",
    );
  });

  test("failed turns are left out of a real conversation", () => {
    const prompt = formatHistoryPrompt(
      [
        msg({ from: "you", text: "first" }),
        msg({ text: "Delivery failed: reset", failed: true }),
        msg({ from: "you", text: "second" }),
      ],
      "third",
    );
    assert.equal(historyTurnCount(prompt), 2);
    assert.doesNotMatch(prompt, /Delivery failed/);
  });
});

describe("the prompt can never exceed what the bridge accepts", () => {
  test("a near-limit question still goes through, with history dropped", () => {
    const history = [msg({ from: "you", text: "context" })];
    const question = "q".repeat(MAX_PROMPT_CHARS - 10);
    const prompt = formatHistoryPrompt(history, question);
    // The question is never truncated; that is the operator's actual input.
    assert.ok(prompt.includes(question));
    assert.ok(prompt.length <= MAX_PROMPT_CHARS, `prompt was ${prompt.length} chars`);
    assert.equal(historyTurnCount(prompt), 0);
  });

  test("many full-length turns stay inside the limit", () => {
    const history = Array.from({ length: 40 }, () => msg({ text: "y".repeat(MAX_TURN_CHARS) }));
    for (const question of ["short", "q".repeat(1_000), "q".repeat(MAX_PROMPT_CHARS - 200)]) {
      const prompt = formatHistoryPrompt(history, question);
      assert.ok(
        prompt.length <= MAX_PROMPT_CHARS,
        `prompt was ${prompt.length} chars for a ${question.length} char question`,
      );
    }
  });

  test("the newest turn is preferred over the oldest when space is tight", () => {
    // Numbered, so "which turn survived" is answerable at all — identical
    // bodies cannot distinguish head from tail.
    const history = Array.from({ length: 12 }, (_, i) =>
      msg({ from: "you", text: `turn-${i} ${"z".repeat(900)}` }),
    );
    const prompt = formatHistoryPrompt(history, "go on");
    assert.ok(prompt.length <= MAX_PROMPT_CHARS);

    const kept = [...prompt.matchAll(/turn-(\d+)/g)].map((match) => Number(match[1]));
    assert.ok(kept.length > 0, "at least some context fits");
    const newest = kept[kept.length - 1];
    assert.equal(newest, 11, "the last turn is the one worth keeping");
    assert.equal(kept[0], 12 - kept.length, "the kept turns are a contiguous tail");
  });
});

describe("an empty question is never dressed up", () => {
  test("whitespace sends nothing", () => {
    assert.equal(formatHistoryPrompt([msg({})], "   "), "");
  });
});

describe("the prompt never exceeds the wire limit", () => {
  /**
   * The previous boundary test used a 3,800-char question, which left 168
   * characters of budget and therefore no room for a single trimmed turn: it
   * asserted a property of the bare question and passed whether or not the
   * history budget was right. The dangerous range is narrower and in the
   * middle, where the history cap actually engages and the framing overhead is
   * therefore paid on top of a full budget.
   */
  for (const size of [1_449, 1_500, 2_000, 2_500, 3_000, 3_500, 3_948]) {
    test(`a ${size}-char question plus full history still fits`, () => {
      const history = Array.from({ length: 8 }, (_, i) => ({
        id: `m${i}`,
        from: i % 2 === 0 ? "you" : "frontend",
        profile: "frontend",
        text: "h".repeat(900),
        ts: i,
      }));
      const prompt = formatHistoryPrompt(history, "q".repeat(size));
      assert.ok(
        prompt.length <= MAX_PROMPT_CHARS,
        `prompt was ${prompt.length}, limit is ${MAX_PROMPT_CHARS}`,
      );
      assert.ok(prompt.endsWith("q".repeat(size)), "the question is never truncated");
    });
  }

  test("the history is actually carried in that range, so the check is not vacuous", () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      from: "you",
      profile: "frontend",
      text: "h".repeat(900),
      ts: i,
    }));
    const prompt = formatHistoryPrompt(history, "q".repeat(2_000));
    assert.ok(
      historyTurnCount(prompt) > 0,
      "a 2,000-char question should still carry some history",
    );
  });

  /**
   * The precise regression. A 19-character error in the overhead estimate can
   * never change how *many* turns fit, because the smallest turn costs far more
   * than 19 — which is why the size sweep above passes either way. It changes
   * the answer only when one turn lands inside that 19-character window, and
   * the turn must be short enough not to be trimmed, so the window has to be
   * reached with a long question.
   *
   * Question 3,350 leaves 599 characters under a correct overhead and 618
   * under the old 32-char guess. A 601-character line needs 603: excluded by
   * the correct budget, admitted by the old one, which then built a 4,002
   * character prompt against a 4,000 limit.
   */
  test("a turn inside the 19-character overhead gap is left out, not sent", () => {
    const question = "q".repeat(3_350);
    const turn = 596; // becomes "You: " + 596 chars = 601, under MAX_TURN_CHARS
    const prompt = formatHistoryPrompt(
      [{ id: "m", from: "you", profile: "f", text: "h".repeat(turn), ts: 1 }],
      question,
    );
    assert.equal(historyTurnCount(prompt), 0, "the turn does not fit and must be dropped");
    assert.equal(prompt, question, "so the bare question goes out, unchanged");
    assert.ok(prompt.length <= MAX_PROMPT_CHARS);

    // And the other side of the window: one character less of question, and
    // the same turn does fit, so the limit is a ceiling and not a cliff.
    const fits = formatHistoryPrompt(
      [{ id: "m", from: "you", profile: "f", text: "h".repeat(turn), ts: 1 }],
      "q".repeat(3_340),
    );
    assert.equal(historyTurnCount(fits), 1, "a turn this size belongs in the prompt");
    assert.ok(fits.length <= MAX_PROMPT_CHARS, `prompt was ${fits.length}`);
  });
});
