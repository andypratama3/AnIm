import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `actor` used to be copied straight out of the request body into an audit log.
 * With one shared dashboard token the server cannot tell who typed a request, so
 * the honest thing is not to invent an identity — it is to refuse unknown names
 * and to record that the surviving names were declared rather than proven.
 *
 * A log that reads "reviewed by security-engineer" when nobody proved that is
 * worse than no log, because it looks like evidence.
 */

const dir = await mkdtemp(join(tmpdir(), "anim-actor-"));
process.env.ANIM_TASK_STORE = join(dir, "tasks.json");
delete process.env.NODE_ENV;

const store = await import("../lib/data/task-store.ts");

/** A queue seeded with one reviewable item. */
const SEED = {
  tasks: [
    {
      id: "T-1",
      title: "Pair-token matrix rotated",
      owner: "hermes-operator",
      reviewer: "dashboard-engineer",
      state: "PEER_REVIEWED",
      evidence: ["diff", "test output"],
      history: [
        { state: "PEER_REVIEWED", at: 1_000, by: "code-reviewer", note: "seeded" },
      ],
      updatedAt: 1_000,
      createdAt: 1_000,
    },
  ],
};

before(async () => {
  await writeFile(process.env.ANIM_TASK_STORE, JSON.stringify(SEED), "utf8");
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

const seed = async () => {
  await writeFile(process.env.ANIM_TASK_STORE, JSON.stringify(SEED), "utf8");
};

describe("only a real agent can be recorded as the actor", () => {
  test("a registry agent id is accepted", async () => {
    await seed();
    const res = await store.transition("T-1", "VERIFIED", "code-reviewer");
    assert.equal(res.ok, true);
  });

  test("a registry profile name is accepted too", async () => {
    assert.equal(store.isKnownActor("code-reviewer"), true);
  });

  test("an invented name is refused", async () => {
    await seed();
    const res = await store.transition("T-1", "VERIFIED", "totally-made-up");
    assert.equal(res.ok, false);
    assert.equal(res.status, 400);
    assert.match(res.error, /known agent/);
  });

  test("the refusal names are not written into the log", async () => {
    await seed();
    await store.transition("T-1", "VERIFIED", "<script>alert(1)</script>");
    const after = await store.readStore();
    const names = after.tasks[0].history.map((h) => h.by);
    assert.ok(
      !names.some((n) => n.includes("script")),
      "a rejected actor must not reach the audit log",
    );
  });

  test("an empty or non-string actor is refused", async () => {
    await seed();
    for (const bad of ["", "   ", null, 42, {}]) {
      const res = await store.transition("T-1", "VERIFIED", bad);
      assert.equal(res.ok, false, `${JSON.stringify(bad)} must be refused`);
    }
  });

  test("surrounding whitespace is trimmed, not stored", async () => {
    await seed();
    const res = await store.transition("T-1", "VERIFIED", "  code-reviewer  ");
    assert.equal(res.ok, true);
    assert.equal(res.task.history.at(-1).by, "code-reviewer");
  });
});

describe("the log says the name was declared, not verified", () => {
  test("a live transition records its provenance", async () => {
    await seed();
    const res = await store.transition("T-1", "VERIFIED", "code-reviewer", "checked the diff");
    assert.equal(res.ok, true);
    const entry = res.task.history.at(-1);
    assert.equal(entry.by, "code-reviewer");
    assert.equal(
      entry.attribution,
      "declared",
      "a shared session cannot prove who acted, so the row must say so",
    );
  });

  test("the declared marker is not retrofitted onto seeded rows", async () => {
    await seed();
    const res = await store.transition("T-1", "VERIFIED", "code-reviewer");
    const seeded = res.task.history[0];
    assert.equal(seeded.by, "code-reviewer");
    assert.equal(
      seeded.attribution,
      undefined,
      "seeded history predates this field and must not be rewritten",
    );
  });
});

describe("the peer-review policy still applies to declared names", () => {
  test("the owner cannot verify their own work, even by declaring another role", async () => {
    await seed();
    const res = await store.transition("T-1", "VERIFIED", "hermes-operator");
    assert.equal(res.ok, false);
    assert.equal(res.status, 403);
    assert.match(res.error, /owner cannot verify/);
  });

  test("VERIFIED still requires a peer review first", async () => {
    await writeFile(
      process.env.ANIM_TASK_STORE,
      JSON.stringify({ tasks: [{ ...SEED.tasks[0], state: "IN_PROGRESS" }] }),
      "utf8",
    );
    const res = await store.transition("T-1", "VERIFIED", "code-reviewer");
    assert.equal(res.ok, false);
    assert.equal(res.status, 409);
    assert.match(res.error, /peer review/);
  });
});
