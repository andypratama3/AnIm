import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The transcript is an audit log, so two properties matter more than anything
 * else in the chat feature: a question must be on record even when the agent
 * never answers, and two turns written at the same time must both survive.
 *
 * The second one used to fail. Every write is a read-modify-write of one JSON
 * file, so two concurrent requests both read the same snapshot and the second
 * atomic rename discards the first turn. The result looked complete.
 */

const dir = await mkdtemp(join(tmpdir(), "anim-chat-durability-"));
process.env.ANIM_CHAT_STORE = dir;
process.env.ANIM_CHAT_MAX_MESSAGES = "200";

const store = await import("../lib/data/chat-store.ts");

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

const say = (text) => store.newMessage("you", "default", text);
const reply = (text) => store.newMessage("agent", "default", text);

describe("a question survives an agent that never answers", () => {
  before(async () => {
    await store.clearTranscript("default");
  });

  test("the question is readable before any reply exists", async () => {
    await store.appendMessage("default", say("what happened to the deploy?"));

    const transcript = await store.readTranscript("default");
    assert.equal(transcript.messages.length, 1);
    assert.equal(transcript.messages[0].text, "what happened to the deploy?");
    assert.equal(transcript.messages[0].from, "you");
  });

  test("it is already on disk, not just in memory", async () => {
    const raw = await readFile(join(dir, "default.json"), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.messages.length, 1, "the question must be durable before the reply");
    assert.equal(parsed.messages[0].from, "you");
  });

  test("the reply is appended afterwards, in order", async () => {
    await store.appendMessage("default", reply("the deploy finished at 14:02"));
    const transcript = await store.readTranscript("default");
    assert.deepEqual(
      transcript.messages.map((m) => m.from),
      ["you", "agent"],
    );
  });
});

describe("concurrent turns are not lost", () => {
  before(async () => {
    await store.clearTranscript("default");
  });

  test("ten simultaneous appends all survive", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => store.appendMessage("default", say(`q${i}`))),
    );

    const transcript = await store.readTranscript("default");
    assert.equal(
      transcript.messages.length,
      10,
      "read-modify-write without a lock drops the turns written concurrently",
    );
    const texts = transcript.messages.map((m) => m.text);
    for (let i = 0; i < 10; i += 1) {
      assert.ok(texts.includes(`q${i}`), `q${i} was lost`);
    }
  });

  test("interleaved questions and replies are all preserved in order", async () => {
    await store.clearTranscript("default");
    const writes = [];
    for (let i = 0; i < 5; i += 1) {
      writes.push(store.appendMessage("default", say(`ask-${i}`)));
      writes.push(store.appendMessage("default", reply(`answer-${i}`)));
    }
    await Promise.all(writes);

    const transcript = await store.readTranscript("default");
    assert.equal(transcript.messages.length, 10);
    // Each question must still be followed by its own answer.
    for (let i = 0; i < 5; i += 1) {
      const at = transcript.messages.findIndex((m) => m.text === `ask-${i}`);
      assert.ok(at >= 0, `ask-${i} missing`);
      assert.equal(
        transcript.messages[at + 1]?.text,
        `answer-${i}`,
        `answer-${i} must follow its own question`,
      );
    }
  });

  test("one profile's slow write does not block another", async () => {
    await store.clearTranscript("default");
    await store.clearTranscript("ceo-bor");

    const slow = store.appendMessage("default", say("slow"));
    const fast = store.appendMessage("ceo-bor", store.newMessage("you", "ceo-bor", "fast"));

    await Promise.all([slow, fast]);
    assert.equal((await store.readTranscript("ceo-bor")).messages.length, 1);
    assert.equal((await store.readTranscript("default")).messages.length, 1);
  });
});

describe("clearing is serialised against in-flight writes", () => {
  test("a clear that races an append leaves a consistent file", async () => {
    await store.clearTranscript("default");
    await Promise.all([
      store.appendMessage("default", say("a")),
      store.appendMessage("default", say("b")),
      store.clearTranscript("default"),
    ]);

    // Whatever the interleaving, the file must parse: never a half-written one.
    const transcript = await store.readTranscript("default");
    assert.ok(Array.isArray(transcript.messages));
    const raw = await readFile(join(dir, "default.json"), "utf8").catch(() => "{}");
    assert.doesNotThrow(() => JSON.parse(raw), "the transcript file must never be corrupt");
  });
});

describe("appendExchange still writes both halves at once", () => {
  test("it remains available for callers that want one atomic write", async () => {
    await store.clearTranscript("default");
    const transcript = await store.appendExchange({
      profile: "default",
      outgoing: say("one shot"),
      incoming: reply("done"),
    });
    assert.deepEqual(
      transcript.messages.map((m) => m.from),
      ["you", "agent"],
    );
  });
});
