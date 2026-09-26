import { test, describe, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

/**
 * The store tests prove the primitives. This file proves the route actually
 * uses them in the right order, which is the part that was wrong: the handler
 * said "the question is recorded before the agent is contacted" while the
 * write only happened after the agent had already answered or thrown.
 *
 * Removing that one `appendMessage` call from the route does not fail any store
 * test, so without this file the regression would be invisible.
 */

const dir = await mkdtemp(join(tmpdir(), "anim-chat-route-"));
process.env.ANIM_CHAT_STORE = dir;
delete process.env.ANIM_API_TOKEN;
delete process.env.NODE_ENV;
// This file is about what the conversation records and sends, not about the
// limiter, which `guard-window.test.mjs` covers. The default is 6 writes a
// minute and these are all one client, so the later cases would be refused
// before reaching any assertion.
process.env.ANIM_CHAT_RATE_LIMIT = "500";

const stubUrl = pathToFileURL(
  new URL("./fixtures/agent-chat-stub.mjs", import.meta.url).pathname,
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/data/agent-chat") {
      return nextResolve(stubUrl, context);
    }
    return nextResolve(specifier, context);
  },
});

const { agent, gate } = await import("./fixtures/agent-chat-stub.mjs");
const { POST, DELETE } = await import("../app/api/agent-chat/route.ts");

const ask = (prompt) =>
  new Request("http://127.0.0.1:3000/api/agent-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile: "default", prompt }),
  });

const onDisk = async (profile = "default") => {
  const raw = await readFile(join(dir, `${profile}.json`), "utf8");
  return JSON.parse(raw);
};

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the question is durable before the agent is contacted", () => {
  before(async () => {
    const { clearTranscript } = await import("../lib/data/chat-store.ts");
    await clearTranscript("default");
    agent.reply = "the deploy finished at 14:02";
    agent.throwWith = null;
    agent.gate = null;
    agent.onContacted = null;
  });

  test("the question is on disk while the agent is still thinking", async () => {
    const held = gate();
    agent.gate = held;

    const pending = POST(ask("what happened to the deploy?"));

    // Wait until the handler has actually reached the agent call.
    await new Promise((resolve) => {
      agent.onContacted = resolve;
    });

    // The agent has been contacted and has not replied yet.
    const messages = (await onDisk()).messages;
    assert.equal(
      messages.length,
      1,
      "the question must be on record before the agent answers",
    );
    assert.equal(messages[0].from, "you");
    assert.equal(messages[0].text, "what happened to the deploy?");

    held.open();
    const res = await pending;
    assert.equal(res.status, 200);
    agent.gate = null;
  });

  test("the reply is appended after the agent answers", async () => {
    const messages = (await onDisk()).messages;
    assert.deepEqual(
      messages.map((m) => m.from),
      ["you", "agent"],
    );
    assert.equal(messages[1].text, "the deploy finished at 14:02");
  });
});

describe("a question survives an agent that throws", () => {
  test("the failure is recorded next to the question", async () => {
    const { clearTranscript } = await import("../lib/data/chat-store.ts");
    await clearTranscript("default");

    agent.throwWith = "ssh: connect to host 10.0.0.5 port 22: No route to host";
    const res = await POST(ask("are you there?"));
    assert.equal(res.status, 502);

    const messages = (await onDisk()).messages;
    assert.equal(messages.length, 2, "question and failure must both be recorded");
    assert.equal(messages[0].from, "you");
    assert.equal(messages[1].from, "agent");
    assert.equal(messages[1].failed, true);
    assert.match(messages[1].text, /Transport error/);

    agent.throwWith = null;
  });
});

describe("the handler rejects what it should", () => {
  test("an unknown profile never reaches the agent", async () => {
    let contacted = false;
    agent.onContacted = () => {
      contacted = true;
    };
    const res = await POST(
      new Request("http://127.0.0.1:3000/api/agent-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: "../../etc/passwd", prompt: "hi" }),
      }),
    );
    assert.equal(res.status, 400);
    assert.equal(contacted, false, "a path-traversal profile must be refused outright");
    agent.onContacted = null;
  });

  test("a cross-origin write is refused before the agent is contacted", async () => {
    let contacted = false;
    agent.onContacted = () => {
      contacted = true;
    };
    const res = await POST(
      new Request("http://127.0.0.1:3000/api/agent-chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          host: "127.0.0.1:3000",
        },
        body: JSON.stringify({ profile: "default", prompt: "hi" }),
      }),
    );
    assert.equal(res.status, 403);
    assert.equal(contacted, false, "the origin check must run before the agent call");
    agent.onContacted = null;
  });
});

/**
 * The transcript was durable and the agent was amnesiac: `chatWithProfile` was
 * handed one string, so each turn started a process that had never seen the
 * conversation. The route now assembles prior turns from its own record and
 * passes them as context. These assert the wiring, since the formatter itself
 * is covered in `chat-history.test.mjs` — what matters here is that the route
 * actually sends what the formatter built, and still records the question
 * exactly as typed.
 */
describe("prior turns are carried into the agent call", () => {
  // Its own profile, so the transcript and the rate-limit bucket are not shared
  // with the durability tests above. That sharing is what made a first turn
  // arrive with history and a sixth request arrive rate-limited.
  const profile = "code-reviewer";
  const sent = [];
  const askProfile = (prompt) =>
    new Request("http://127.0.0.1:3000/api/agent-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile, prompt }),
    });
  const post = async (prompt) => {
    const res = await POST(askProfile(prompt));
    assert.equal(res.status, 200, `the send failed, so nothing was asserted: ${res.status}`);
  };

  beforeEach(() => {
    sent.length = 0;
    agent.onContacted = ({ prompt }) => sent.push(prompt);
  });
  afterEach(() => {
    agent.onContacted = null;
  });

  test("a second question carries the first, as context", async () => {
    await post("what broke in the deploy?");
    await post("and the type import?");

    assert.match(sent[0], /^what broke in the deploy\?$/, "a first turn has no history");
    assert.match(sent[1], /what broke in the deploy\?/, "the earlier question is in the prompt");
    assert.match(sent[1], /the deploy finished at 14:02/, "and so is the answer to it");
    assert.match(sent[1], /and the type import\?$/, "the new question comes last");

    // The question is recorded verbatim, not the decorated prompt: the
    // transcript is the record of what was asked, not of how it was framed.
    // The reply is appended after it, so the last question is what to look at.
    const messages = (await onDisk(profile)).messages;
    const asked = messages.filter((message) => message.from === "you");
    assert.deepEqual(
      asked.map((message) => message.text),
      ["what broke in the deploy?", "and the type import?"],
    );
    assert.doesNotMatch(
      messages.map((message) => message.text).join("\n"),
      /Earlier in this conversation/,
      "the framing is wire sugar and must not leak into the record",
    );
  });

  test("the question is not duplicated by its own history entry", async () => {
    await post("only one question");
    const occurrences = sent[0].split("only one question").length - 1;
    assert.equal(occurrences, 1, "it appears once, as the live ask");
  });

  test("a cleared conversation starts clean again", async () => {
    const cleared = await DELETE(
      new Request(`http://127.0.0.1:3000/api/agent-chat?profile=${profile}`, {
        method: "DELETE",
        headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" },
      }),
    );
    const detail = cleared.status === 200 ? "" : ` (${await cleared.clone().text()})`;
    assert.equal(cleared.status, 200, `the operator asked for this to work${detail}`);

    await post("fresh start");
    assert.doesNotMatch(sent[0], /Earlier in this conversation/);
  });
});
