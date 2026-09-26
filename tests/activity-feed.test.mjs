import assert from "node:assert/strict";
import { test } from "node:test";

import { buildActivityFeed, levelForState } from "@/lib/data/activity-feed";

function task(id, overrides = {}) {
  return {
    id,
    title: `task ${id}`,
    owner: "ceo-bor",
    reviewer: "",
    state: "IN_PROGRESS",
    evidence: [],
    createdAt: 1_000,
    updatedAt: 2_000,
    history: [],
    ...overrides,
  };
}

function message(overrides = {}) {
  return {
    id: "m1",
    from: "agent",
    profile: "frontend",
    text: "done",
    ts: 5_000,
    ...overrides,
  };
}

test("nothing recorded means nothing reported", () => {
  // The old feed answered this with 260 invented rows.
  assert.deepEqual(buildActivityFeed([], []), []);
});

test("seed rows are not activity", () => {
  const seeded = task("t1", {
    history: [{ state: "PROPOSED", at: 1_000, by: "ceo-bor", note: "seeded" }],
  });
  assert.deepEqual(buildActivityFeed([seeded], []), []);
});

test("a real transition becomes one event, attributed to who moved it", () => {
  const moved = task("t1", {
    owner: "ceo-bor",
    history: [
      { state: "PROPOSED", at: 1_000, by: "ceo-bor", note: "seeded" },
      { state: "SELF_CHECKED", at: 9_000, by: "frontend", note: "ran the suite" },
    ],
  });
  const [event] = buildActivityFeed([moved], []);
  assert.equal(event.agent, "frontend", "the actor, not the owner");
  assert.equal(event.kind, "task");
  assert.equal(event.level, "info");
  assert.equal(event.ts, 9_000);
  assert.match(event.title, /SELF_CHECKED/);
  assert.equal(event.detail, "ran the suite");
});

test("state maps to a level an operator can triage by", () => {
  assert.equal(levelForState("VERIFIED"), "success");
  assert.equal(levelForState("FAILED"), "error");
  assert.equal(levelForState("BLOCKED"), "warn");
  assert.equal(levelForState("PROPOSED"), "info");
  assert.equal(levelForState("SELF_CHECKED"), "info");
});

test("a failed delivery is an error, not a short reply", () => {
  const [failed] = buildActivityFeed(
    [],
    [message({ from: "agent", text: "Delivery failed: timeout", failed: true })],
  );
  assert.equal(failed.level, "error");
  const [reply] = buildActivityFeed([], [message({ from: "agent" })]);
  assert.equal(reply.level, "success");
  const [asked] = buildActivityFeed([], [message({ from: "you", text: "why?" })]);
  assert.equal(asked.level, "info");
});

test("a question and its reply are separate records", () => {
  const feed = buildActivityFeed(
    [],
    [
      message({ id: "q", from: "you", text: "why?", ts: 1_000 }),
      message({ id: "a", from: "agent", text: "because", ts: 2_000 }),
    ],
  );
  assert.equal(feed.length, 2);
  assert.match(feed[0].title, /replied/, "newest first");
  assert.match(feed[1].title, /question sent/);
});

test("newest first across both record sets", () => {
  const feed = buildActivityFeed(
    [task("t1", { history: [{ state: "IN_PROGRESS", at: 3_000, by: "qa-engineer" }] })],
    [message({ ts: 7_000 }), message({ id: "m2", ts: 4_000 })],
  );
  assert.deepEqual(
    feed.map((event) => event.ts),
    [7_000, 4_000, 3_000],
  );
});

test("ids are unique so the list can key on them", () => {
  // Two messages in the same millisecond is a real case, not a contrived one:
  // an optimistic append followed by a fast reply can land together.
  const feed = buildActivityFeed(
    [task("t1", { history: [{ state: "IN_PROGRESS", at: 1_000, by: "a" }] })],
    [
      message({ id: "you-1", ts: 1 }),
      message({ id: "agent-2", ts: 1 }),
      message({ id: "you-3", profile: "backend", ts: 1 }),
    ],
  );
  assert.equal(feed.length, 4);
  assert.equal(new Set(feed.map((event) => event.id)).size, feed.length);
});

test("two transitions of one task at the same instant stay distinct", () => {
  const feed = buildActivityFeed(
    [
      task("t1", {
        history: [
          { state: "IN_PROGRESS", at: 1_000, by: "qa-engineer" },
          { state: "BLOCKED", at: 1_000, by: "qa-engineer" },
        ],
      }),
    ],
    [],
  );
  assert.equal(feed.length, 2);
  assert.equal(new Set(feed.map((event) => event.id)).size, 2);
});

test("replies are truncated for the list, so one long answer cannot flood it", () => {
  const [event] = buildActivityFeed([], [message({ text: "x".repeat(4_000) })]);
  assert.ok(event.detail.length <= 160, `detail was ${event.detail.length} chars`);
});
