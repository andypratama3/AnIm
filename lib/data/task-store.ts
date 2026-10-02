import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readRegistry } from "@/lib/data/registry";

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

/**
 * Marks a history entry whose actor name was asserted by the client.
 *
 * The dashboard holds one shared token, so the server cannot tell who typed a
 * request. Recording the provenance in the row keeps a later reader from
 * mistaking a self-declared name for a verified second reviewer.
 */
export const ACTOR_ATTRIBUTION = "declared" as const;

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
  history: {
    state: State;
    at: number;
    by: string;
    /**
     * Absent on seeded rows; present on every live transition to say the name
     * was asserted by the client rather than authenticated by the server.
     */
    attribution?: typeof ACTOR_ATTRIBUTION;
    note?: string;
  }[];
  updatedAt: number;
  createdAt: number;
};

export type StoreShape = { tasks: Task[] };

const STORE_PATH =
  process.env.ANIM_TASK_STORE ?? join(process.cwd(), ".data", "review-queue.json");

/**
 * Empty on first run — no invented history. The dashboard ships with zero
 * review items; every row after that is an operator-created record with a
 * real timestamp. Earlier versions seeded VERIFIED rows for work that was
 * never reviewed here, which put claims of peer sign-off in front of the
 * owner with no evidence behind them.
 */
function seed(): StoreShape {
  return { tasks: [] };
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
    // turbopackIgnore: STORE_PATH comes from ANIM_TASK_STORE, so the bundler
    // cannot scope it to a subfolder. Opting out keeps the trace out of the
    // server output.
    const raw = await readFile(/*turbopackIgnore: true*/ STORE_PATH, "utf8");
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
 * Who the server is willing to accept as the acting agent.
 *
 * The dashboard authenticates with one shared token, so the server genuinely
 * cannot tell which person typed a request. What it *can* do is refuse to write
 * an unknown string into an audit log: `actor` used to be copied straight from
 * the request body, so any caller could attribute a review to a name that does
 * not exist.
 *
 * Names still come from the client, so the history records them as declared
 * rather than proven. `attribution` says so in the stored record itself, because
 * an audit log that looks verified but is not is the failure this is meant to
 * prevent.
 */
export function isKnownActor(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const name = value.trim();
  if (!isKnownAgentName(name)) return false;
  return true;
}

function isKnownAgentName(name: string): boolean {
  try {
    const known = new Set<string>();
    for (const agent of readRegistry().agents) {
      if (agent.id) known.add(agent.id);
      if (agent.profile) known.add(agent.profile);
    }
    return known.has(name);
  } catch {
    // A missing or unreadable registry must not make every transition succeed.
    return false;
  }
}

/**
 * Apply a state change, enforcing the acceptance policy from
 * `agents/registry.json`: an item may only reach VERIFIED when a second agent
 * has reviewed it, and a reviewer may never be the owner.
 *
 * `actor` is a declared name, validated against the registry but not
 * authenticated — see `ACTOR_ATTRIBUTION`.
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

  if (!isKnownActor(actor)) {
    return {
      ok: false,
      status: 400,
      error: "actor must be a known agent id or profile from the registry",
    };
  }
  const declaredBy = actor.trim();

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

  // Terminal is checked first: a task sitting in VERIFIED has no exit, and saying
  // "requires a peer review" for an attempt to re-verify would be misleading.
  if (task.state === "VERIFIED") {
    return { ok: false, status: 409, error: "VERIFIED is terminal" };
  }

  // The acceptance policy, checked before the transition table so the caller is
  // told what is actually missing. Previously this sat below the table, where it
  // was unreachable: the table already refuses every non-PEER_REVIEWED move to
  // VERIFIED, so the actionable message could never be shown.
  if (next === "VERIFIED") {
    // A policy check on the declared name. It is not authentication: the shared
    // session token cannot prove a second person reviewed anything, which is why
    // the history records the attribution as declared.
    if (declaredBy === task.owner) {
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

  if (!TRANSITIONS[task.state].includes(next)) {
    return {
      ok: false,
      status: 409,
      error: `cannot move from ${task.state} to ${next}`,
    };
  }

  const at = Date.now();
  const updated: Task = {
    ...task,
    state: next,
    updatedAt: at,
    history: [
      ...task.history,
      {
        state: next,
        at,
        by: declaredBy,
        attribution: ACTOR_ATTRIBUTION,
        ...(note ? { note } : {}),
      },
    ],
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
