import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * The transcript store decides what an operator can audit after the fact, so it
 * is held to the same standard as the acceptance store: real durability, no
 * silent data loss, and no way to address a file that is not a profile.
 */
let dir;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "anim-chat-"));
  process.env.ANIM_CHAT_STORE = dir;
  process.env.ANIM_CHAT_MAX_MESSAGES = "6";
});

let mod;
const load = async () => {
  mod = await import(`../lib/data/chat-store.ts?bust=${Date.now()}${Math.random()}`);
  return mod;
};
beforeEach(async () => {
  for (const file of await readdir(dir).catch(() => [])) {
    await rm(join(dir, file), { force: true });
  }
  await load();
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

const you = (profile, text) => mod.newMessage("you", profile, text);
const agent = (profile, text, extra) => mod.newMessage("agent", profile, text, extra ?? {});

describe("addressing", () => {
  test("a profile outside the allowlist cannot be turned into a path", async () => {
    for (const bad of ["../../etc/passwd", "..", "default/../../x", "/etc/passwd", ""]) {
      await assert.rejects(
        () => mod.readTranscript(bad),
        /non-addressable/,
        `expected ${JSON.stringify(bad)} to be refused`,
      );
    }
  });

  test("a traversal attempt leaves no file behind", async () => {
    await assert.rejects(() => mod.readTranscript("../escape"));
    assert.deepEqual(await readdir(dir).catch(() => []), []);
  });

  test("an unknown profile reads as an empty conversation, not an error", async () => {
    const transcript = await mod.readTranscript("career-agent");
    assert.deepEqual(transcript, { profile: "career-agent", messages: [], dropped: 0 });
  });
});

describe("appending", () => {
  test("an exchange is stored and read back in order", async () => {
    await mod.appendExchange({
      profile: "default",
      outgoing: you("default", "status?"),
      incoming: agent("default", "working on the mesh"),
    });
    const transcript = await mod.readTranscript("default");
    assert.equal(transcript.messages.length, 2);
    assert.equal(transcript.messages[0].from, "you");
    assert.equal(transcript.messages[1].from, "agent");
    assert.equal(transcript.dropped, 0);
  });

  test("a question with no reply is still recorded", async () => {
    await mod.appendExchange({ profile: "default", outgoing: you("default", "are you there?") });
    const transcript = await mod.readTranscript("default");
    assert.equal(transcript.messages.length, 1);
    assert.equal(transcript.messages[0].text, "are you there?");
  });

  test("a failed reply is kept alongside the question that caused it", async () => {
    await mod.appendExchange({
      profile: "default",
      outgoing: you("default", "hello"),
      incoming: agent("default", "Delivery failed: timeout", { failed: true }),
    });
    const { messages } = await mod.readTranscript("default");
    assert.equal(messages.length, 2);
    assert.equal(messages[0].from, "you");
    assert.equal(messages[1].from, "agent");
    assert.equal(messages[1].failed, true, "a failure must not read as a normal reply");
  });

  test("conversations are kept apart per profile", async () => {
    await mod.appendExchange({ profile: "default", outgoing: you("default", "for default") });
    await mod.appendExchange({ profile: "frontend", outgoing: you("frontend", "for frontend") });

    const a = await mod.readTranscript("default");
    const b = await mod.readTranscript("frontend");
    assert.equal(a.messages.length, 1);
    assert.equal(a.messages[0].text, "for default");
    assert.equal(b.messages[0].text, "for frontend");
  });

  test("ids are unique so React keys never collide", async () => {
    await mod.appendExchange({ profile: "default", outgoing: you("default", "one") });
    await mod.appendExchange({ profile: "default", outgoing: you("default", "two") });
    const { messages } = await mod.readTranscript("default");
    assert.equal(new Set(messages.map((m) => m.id)).size, messages.length);
  });
});

describe("bounds", () => {
  test("the log is trimmed to the cap and the loss is counted, not hidden", async () => {
    // Cap is 6 messages for this suite.
    for (let i = 0; i < 5; i += 1) {
      await mod.appendExchange({
        profile: "default",
        outgoing: you("default", `q${i}`),
        incoming: agent("default", `a${i}`),
      });
    }
    const transcript = await mod.readTranscript("default");
    assert.equal(transcript.messages.length, 6, "the cap holds");
    assert.equal(transcript.dropped, 4, "the discarded turns are reported");
    assert.equal(transcript.messages[0].text, "q2", "the newest turns are the ones kept");
  });

  test("the dropped count survives a reload instead of resetting to zero", async () => {
    // 8 single-message appends against a cap of 6, so two are discarded.
    for (let i = 0; i < 8; i += 1) {
      await mod.appendExchange({ profile: "default", outgoing: you("default", `q${i}`) });
    }
    const reloaded = await load();
    const transcript = await reloaded.readTranscript("default");
    assert.equal(transcript.messages.length, 6);
    assert.equal(transcript.dropped, 2);
    assert.equal(transcript.messages[0].text, "q2");
  });

  test("an oversized message is clamped with an ellipsis", async () => {
    const huge = "x".repeat(40_000);
    await mod.appendExchange({ profile: "default", outgoing: you("default", huge) });
    const [stored] = (await mod.readTranscript("default")).messages;
    assert.ok(stored.text.length < 40_000);
    assert.ok(stored.text.endsWith("\u2026"));
  });

  test("a hand-edited file longer than the cap is re-trimmed on read", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      from: "you",
      profile: "default",
      text: `t${i}`,
      ts: i,
    }));
    await writeFile(join(dir, "default.json"), JSON.stringify({ profile: "default", messages: many }));
    const transcript = await mod.readTranscript("default");
    assert.equal(transcript.messages.length, 6);
    assert.equal(transcript.dropped, 14);
  });
});

describe("degrading and clearing", () => {
  test("a corrupt file yields an empty conversation instead of an error", async () => {
    await writeFile(join(dir, "default.json"), "{ not json at all");
    assert.deepEqual((await mod.readTranscript("default")).messages, []);
  });

  test("entries of the wrong shape are dropped, valid ones survive", async () => {
    await writeFile(
      join(dir, "default.json"),
      JSON.stringify({
        profile: "default",
        messages: [
          { id: "a", from: "you", profile: "default", text: "keep", ts: 1 },
          { id: "b", from: "martian", profile: "default", text: "bad role", ts: 2 },
          { from: "you", text: "no id", ts: 3 },
          null,
        ],
      }),
    );
    const { messages } = await mod.readTranscript("default");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, "keep");
  });

  test("clearing removes only the named profile", async () => {
    await mod.appendExchange({ profile: "default", outgoing: you("default", "a") });
    await mod.appendExchange({ profile: "frontend", outgoing: you("frontend", "b") });

    await mod.clearTranscript("default");
    assert.equal((await mod.readTranscript("default")).messages.length, 0);
    assert.equal((await mod.readTranscript("frontend")).messages.length, 1);
  });

  test("clearing something that was never written is not an error", async () => {
    await assert.doesNotReject(() => mod.clearTranscript("qa-engineer"));
  });

  test("listing transcripts reports only real profiles", async () => {
    await mod.appendExchange({ profile: "default", outgoing: you("default", "a") });
    await mod.appendExchange({ profile: "backend", outgoing: you("backend", "b") });
    // A stray file that is not a chattable profile must not be advertised.
    await writeFile(join(dir, "attacker.json"), "{}");
    await writeFile(join(dir, "notes.txt"), "ignored");

    const listed = await mod.listTranscripts();
    assert.deepEqual(listed.sort(), ["backend", "default"]);
  });

  test("the stored file is readable JSON with no temp file left over", async () => {
    await mod.appendExchange({ profile: "default", outgoing: you("default", "a") });
    const raw = JSON.parse(await readFile(join(dir, "default.json"), "utf8"));
    assert.equal(raw.profile, "default");
    assert.equal(raw.messages.length, 1);
    const files = await readdir(dir);
    assert.equal(files.filter((f) => f.includes(".tmp")).length, 0);
  });
});
