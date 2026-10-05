import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (rel) => readFileSync(join(root, rel), "utf8");
const store = read("lib/data/chat-store.ts");
const page = read("components/dashboard/discussion-page.tsx");
const route = read("app/api/agent-chat/route.ts");

describe("reply thread", () => {
  it("models a reply as a display-only reference on the message", () => {
    assert.match(store, /replyTo\?: ReplyRef/);
    // A quote must never be handed to the model: it is a reading aid, and
    // splicing it into the prompt would double the history.
    assert.doesNotMatch(store, /formatHistoryPrompt[\s\S]{0,400}replyTo/);
  });

  it("accepts a reply reference from the client", () => {
    assert.match(route, /replyTo\?: unknown/);
    assert.match(route, /newMessage\("you", profile, prompt\.trim\(\), \{ replyTo \}\)/);
  });

  it("quotes the replied message inside the bubble", () => {
    assert.match(page, /\{message\.replyTo \? \(/);
    assert.match(page, /message\.replyTo\.snippet/);
  });

  it("clears the pending quote when the turn is sent", () => {
    assert.match(page, /setReplyTo\(null\);/);
  });
});

describe("reply reference validation", () => {
  it("rejects a malformed reference instead of rendering the file's claim", () => {
    assert.match(store, /function normalizeReply/);
    assert.match(store, /if \(typeof r\.snippet !== "string"\) return null;/);
    assert.match(store, /if \(r\.from !== "you" && r\.from !== "agent"\) return null;/);
    assert.match(store, /\/\/ Copy rather than delete/);
  });

  it("caps the snippet so a quote cannot carry a second copy of the text", () => {
    assert.match(store, /const MAX_SNIPPET = 240;/);
    assert.match(store, /snippet: clamp\(r\.snippet\.slice\(0, MAX_SNIPPET\)\)/);
  });
});

describe("bubble geometry", () => {
  it("writes the radius as one shorthand rather than conflicting utilities", () => {
    // Two `rounded-*` utilities conflict and stylesheet order decides the
    // winner, so the body and tail must be a single 4-value shorthand.
    assert.match(page, /const RADIUS_MINE = "rounded-\[18px_18px_6px_18px\]";/);
    assert.match(page, /const RADIUS_THEIRS = "rounded-\[18px_18px_18px_6px\]";/);
  });

  it("no longer leans on the overridden radius scale for any bubble", () => {
    // The typing bubble is a bubble too: it used `rounded-2xl rounded-bl-md`,
    // the same conflicting pair, so it is checked alongside the sent/received
    // geometry rather than assumed to follow it.
    assert.doesNotMatch(page, /rounded-2xl rounded-bl-md/);
    assert.doesNotMatch(page, /rounded-2xl rounded-br-md/);
    assert.match(page, /RADIUS_THEIRS\}/);
  });
});

describe("copy action", () => {
  it("writes the raw message text to the clipboard", () => {
    assert.match(page, /navigator\.clipboard\?\.writeText\(message\.text\)/);
  });

  it("stays reachable on touch, where there is no hover", () => {
    assert.match(page, /\[@media\(hover:none\)\]:opacity-100/);
  });

  it("does not submit the composer form", () => {
    assert.match(page, /type="button"[\s\S]{0,120}aria-label=\{label\}/);
  });
});

describe("date separators", () => {
  it("breaks the thread on a calendar day change", () => {
    assert.match(page, /const newDay = !prev \|\| !sameDay\(prev\.ts, message\.ts\);/);
    assert.match(page, /function sameDay/);
    assert.match(page, /function dayLabel/);
  });

  it("never hides a divider inside a run from one sender", () => {
    // The name/avatar rule keys off grouping; the divider keys off the day.
    assert.match(page, /const showName = !mine && \(startsGroup \|\| newDay\);/);
  });
});

describe("agent tints", () => {
  it("derives a stable colour from the profile id", () => {
    assert.match(page, /function tintFor\(profile: string\)/);
    assert.match(page, /const AGENT_TINTS = \[/);
  });
});
