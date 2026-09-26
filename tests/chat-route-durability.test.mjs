import { test, describe, before, after } from "node:test";
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
const { POST } = await import("../app/api/agent-chat/route.ts");

const ask = (prompt) =>
  new Request("http://127.0.0.1:3000/api/agent-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile: "default", prompt }),
  });

const onDisk = async () => {
  const raw = await readFile(join(dir, "default.json"), "utf8");
  return JSON.parse(raw).messages;
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
    const messages = await onDisk();
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
    const messages = await onDisk();
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

    const messages = await onDisk();
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
