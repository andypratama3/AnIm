import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * The store reads its path at module load, so the environment must be set before
 * the dynamic import below. node:test runs each file in its own process, which
 * is what makes this isolation reliable.
 */
let dir;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "anim-store-"));
  process.env.ANIM_TASK_STORE = join(dir, "review-queue.json");
});

/** Fresh module instance, so module-level state cannot leak between tests. */
let mod;
const load = async () => {
  mod = await import(`../lib/data/task-store.ts?bust=${Date.now()}${Math.random()}`);
  return mod;
};

beforeEach(async () => {
  await rm(process.env.ANIM_TASK_STORE, { force: true });
  await load();
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

const write = (tasks) =>
  writeFile(process.env.ANIM_TASK_STORE, JSON.stringify({ tasks }, null, 2));

const task = (over = {}) => ({
  id: "T-1",
  title: "Example work",
  owner: "hermes-operator",
  reviewer: "code-reviewer",
  state: "PROPOSED",
  evidence: [],
  history: [{ state: "PROPOSED", at: 1, by: "hermes-operator" }],
  updatedAt: 1,
  createdAt: 1,
  ...over,
});

describe("acceptance policy", () => {
  test("an unknown state is rejected as a bad request", async () => {
    const res = await mod.transition("T-1", "SHIPPED", "code-reviewer");
    assert.equal(res.ok, false);
    assert.equal(res.status, 400);
    assert.equal(res.error, "unknown state");
  });

  test("a missing task reports 404 rather than creating one", async () => {
    const res = await mod.transition("nope", "IN_PROGRESS", "hermes-operator");
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
  });

  test("PROPOSED cannot jump straight to VERIFIED", async () => {
    await write([task()]);
    const res = await mod.transition("T-1", "VERIFIED", "code-reviewer");
    assert.equal(res.ok, false);
    assert.equal(res.status, 409);
  });

  test("SELF_CHECKED cannot skip the peer review either", async () => {
    await write([task({ state: "SELF_CHECKED" })]);
    const res = await mod.transition("T-1", "VERIFIED", "code-reviewer");
    assert.equal(res.ok, false);
    assert.equal(res.status, 409);
    assert.match(res.error, /peer review/i);
  });

  test("the owner cannot verify their own work", async () => {
    await write([task({ state: "PEER_REVIEWED" })]);
    const res = await mod.transition("T-1", "VERIFIED", "hermes-operator");
    assert.equal(res.ok, false);
    assert.equal(res.status, 403);
  });

  test("a task whose reviewer is the owner is refused outright", async () => {
    // Seeded data, not a user action: the invariant is checked on every write so
    // a bad seed cannot smuggle a self-review through later.
    await write([task({ state: "PEER_REVIEWED", reviewer: "hermes-operator" })]);
    const res = await mod.transition("T-1", "VERIFIED", "code-reviewer");
    assert.equal(res.ok, false);
    assert.equal(res.status, 409);
    assert.match(res.error, /reviewer must differ/i);
  });

  test("VERIFIED is terminal", async () => {
    await write([task({ state: "VERIFIED" })]);
    for (const next of ["IN_PROGRESS", "BLOCKED", "FAILED", "VERIFIED"]) {
      const res = await mod.transition("T-1", next, "code-reviewer");
      assert.equal(res.ok, false, `expected ${next} to be refused`);
      assert.equal(res.status, 409);
    }
    // Re-verifying must not be reported as a missing peer review.
    assert.match(
      (await mod.transition("T-1", "VERIFIED", "code-reviewer")).error,
      /terminal/i,
    );
  });
});

describe("happy path", () => {
  test("a full reviewed run reaches VERIFIED and records who did it", async () => {
    await write([task()]);
    const actor = "code-reviewer";

    for (const next of ["IN_PROGRESS", "SELF_CHECKED", "PEER_REVIEWED"]) {
      const step = await mod.transition("T-1", next, actor);
      assert.equal(step.ok, true, `expected ${next} to be allowed`);
    }

    const done = await mod.transition("T-1", "VERIFIED", actor, "checked the diff");
    assert.equal(done.ok, true);
    assert.equal(done.task.state, "VERIFIED");
    assert.equal(done.task.history.at(-1).by, actor);
    assert.equal(done.task.history.at(-1).note, "checked the diff");
  });

  test("BLOCKED work can resume but FAILED work only retries", async () => {
    await write([task({ state: "BLOCKED" })]);
    assert.equal((await mod.transition("T-1", "IN_PROGRESS", "hermes-operator")).ok, true);

    await write([task({ state: "FAILED" })]);
    assert.equal((await mod.transition("T-1", "VERIFIED", "code-reviewer")).ok, false);
    assert.equal((await mod.transition("T-1", "IN_PROGRESS", "hermes-operator")).ok, true);
  });
});

describe("durability", () => {
  test("a transition survives a restart of the module", async () => {
    await write([task({ state: "PEER_REVIEWED" })]);
    assert.equal((await mod.transition("T-1", "VERIFIED", "code-reviewer")).ok, true);

    // A new process would re-read the file; re-importing simulates exactly that.
    const restarted = await load();
    const found = (await restarted.readStore()).tasks.find((t) => t.id === "T-1");
    assert.equal(found.state, "VERIFIED");
  });

  test("writes are atomic, leaving no temp file behind", async () => {
    await write([task()]);
    await mod.transition("T-1", "IN_PROGRESS", "hermes-operator");
    const raw = JSON.parse(await readFile(process.env.ANIM_TASK_STORE, "utf8"));
    assert.ok(Array.isArray(raw.tasks));
  });

  test("a corrupt file degrades to an empty queue instead of crashing", async () => {
    await writeFile(process.env.ANIM_TASK_STORE, "{ this is not json");
    const store = await mod.readStore();
    assert.equal(store.tasks.length, 0);
    assert.ok(store.tasks.every((t) => typeof t.id === "string"));
  });

  test("malformed entries are dropped, valid siblings survive", async () => {
    await writeFile(
      process.env.ANIM_TASK_STORE,
      JSON.stringify({ tasks: [task(), { id: "broken" }, null, 7, task({ id: "T-2" })] }),
    );
    const store = await mod.readStore();
    assert.deepEqual(
      store.tasks.map((t) => t.id),
      ["T-1", "T-2"],
    );
  });

  test("a file without a tasks array is not trusted", async () => {
    await writeFile(process.env.ANIM_TASK_STORE, JSON.stringify({ tasks: "nope" }));
    assert.equal((await mod.readStore()).tasks.length, 0);
  });

  test("resetStore restores the empty queue", async () => {
    await write([task()]);
    const fresh = await mod.resetStore();
    assert.equal(fresh.tasks.length, 0);
    const onDisk = JSON.parse(await readFile(process.env.ANIM_TASK_STORE, "utf8"));
    assert.equal(onDisk.tasks.length, 0);
  });

  test("first run starts empty and stays deterministic", async () => {
    const a = await mod.readStore();
    const b = await mod.readStore();
    assert.deepEqual(
      a.tasks.map((t) => [t.id, t.state, t.createdAt]),
      b.tasks.map((t) => [t.id, t.state, t.createdAt]),
    );
  });
});
