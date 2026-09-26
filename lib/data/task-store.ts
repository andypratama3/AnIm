import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * File-backed store for the owner review queue.
 *
 * The queue used to be a module-scope seed array whose "advance" button mutated
 * React state only: every refresh rewrote history and anyone could promote an
 * item to VERIFIED by clicking. Work that gates delivery to the owner has to
 * survive a restart and has to be enforced server-side, so the state lives here
 * and every transition is validated against the acceptance policy.
 */

export const STATES = [
  "PROPOSED",
  "IN_PROGRESS",
  "SELF_CHECKED",
  "PEER_REVIEWED",
  "VERIFIED",
  "BLOCKED",
  "FAILED",
] as const;

export type State = (typeof STATES)[number];

/** Allowed forward/backward moves. VERIFIED is terminal. */
const TRANSITIONS: Record<State, readonly State[]> = {
  PROPOSED: ["IN_PROGRESS", "BLOCKED", "FAILED"],
  IN_PROGRESS: ["SELF_CHECKED", "BLOCKED", "FAILED"],
  SELF_CHECKED: ["PEER_REVIEWED", "IN_PROGRESS", "BLOCKED", "FAILED"],
  PEER_REVIEWED: ["VERIFIED", "SELF_CHECKED", "BLOCKED", "FAILED"],
  VERIFIED: [],
  BLOCKED: ["IN_PROGRESS", "FAILED"],
  FAILED: ["IN_PROGRESS"],
};

export type Task = {
  id: string;
  title: string;
  owner: string;
  reviewer: string;
  state: State;
  evidence: string[];
  history: { state: State; at: number; by: string; note?: string }[];
  updatedAt: number;
  createdAt: number;
};

export type StoreShape = { tasks: Task[] };

const STORE_PATH =
  process.env.ANIM_TASK_STORE ?? join(process.cwd(), ".data", "review-queue.json");

/**
 * Fixed epoch so a first-run seed does not depend on wall-clock time. The seed
 * exists only until an operator writes to the store.
 */
const SEED_EPOCH = 1758800000000;

function seed(): StoreShape {
  const make = (
    id: string,
    title: string,
    owner: string,
    reviewer: string,
    state: State,
    minutesAgo: number,
  ): Task => ({
    id,
    title,
    owner,
    reviewer,
    state,
    evidence: [],
    history: [{ state, at: SEED_EPOCH - minutesAgo * 60_000, by: owner, note: "seeded" }],
    updatedAt: SEED_EPOCH - minutesAgo * 60_000,
    createdAt: SEED_EPOCH - minutesAgo * 60_000,
  });

  return {
    tasks: [
      make("V-1", "19 new profiles created with 25 A2A peers each", "hermes-operator", "dashboard-engineer", "VERIFIED", 18),
      make("V-2", "Pair-token matrix 26x25 rotated, 46 live pairs preserved", "security-engineer", "code-reviewer", "VERIFIED", 42),
      make("V-3", "Dashboard throughput fabricated-metric defect", "dashboard-engineer", "code-reviewer", "VERIFIED", 6),
      make("V-4", "Activation runbook for 19 stopped gateways", "hermes-operator", "devops-engineer", "PEER_REVIEWED", 95),
      make("V-5", "Vault seed for 26 self-improvement logs", "knowledge-agent", "content-strategist", "IN_PROGRESS", 3),
    ],
  };
}

function isState(value: unknown): value is State {
  return typeof value === "string" && (STATES as readonly string[]).includes(value);
}

function validTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.owner === "string" &&
    typeof task.reviewer === "string" &&
    isState(task.state) &&
    Array.isArray(task.history)
  );
}

/** Read the store, tolerating a missing or corrupt file rather than crashing. */
export async function readStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    if (!Array.isArray(parsed?.tasks)) return seed();
    // Drop anything malformed instead of trusting the file blindly.
    return { tasks: parsed.tasks.filter(validTask) };
  } catch {
    return seed();
  }
}

/** Atomic write: a crash mid-save must not truncate the queue. */
async function writeStore(store: StoreShape): Promise<void> {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tmp, STORE_PATH);
}

export type TransitionResult =
  | { ok: true; task: Task }
  | { ok: false; status: number; error: string };

/**
 * Apply a state change, enforcing the acceptance policy from
 * `agents/registry.json`: an item may only reach VERIFIED when a second agent
 * has reviewed it, and a reviewer may never be the owner.
 */
export async function transition(
  id: string,
  next: unknown,
  actor: string,
  note?: string,
): Promise<TransitionResult> {
  if (!isState(next)) {
    return { ok: false, status: 400, error: "unknown state" };
  }

  const store = await readStore();
  const index = store.tasks.findIndex((task) => task.id === id);
  if (index === -1) {
    return { ok: false, status: 404, error: "task not found" };
  }

  const task = store.tasks[index];
  if (task.reviewer === task.owner) {
    return {
      ok: false,
      status: 409,
      error: "reviewer must differ from the owner",
    };
  }

  if (!TRANSITIONS[task.state].includes(next)) {
    return {
      ok: false,
      status: 409,
      error: `cannot move from ${task.state} to ${next}`,
    };
  }

  if (next === "VERIFIED") {
    // The policy requires independent review before the owner sees the work.
    if (actor === task.owner) {
      return {
        ok: false,
        status: 403,
        error: "the owner cannot verify their own work; a peer reviewer must",
      };
    }
    if (task.state !== "PEER_REVIEWED") {
      return {
        ok: false,
        status: 409,
        error: "VERIFIED requires a peer review first",
      };
    }
  }

  const at = Date.now();
  const updated: Task = {
    ...task,
    state: next,
    updatedAt: at,
    history: [...task.history, { state: next, at, by: actor, ...(note ? { note } : {}) }],
  };
  store.tasks[index] = updated;
  await writeStore(store);
  return { ok: true, task: updated };
}

export async function resetStore(): Promise<StoreShape> {
  const store = seed();
  await writeStore(store);
  return store;
}
