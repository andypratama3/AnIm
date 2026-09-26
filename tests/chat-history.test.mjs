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
