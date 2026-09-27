import { getRemoteInventory } from "@/lib/data/remote";
import { runOnMesh } from "@/lib/data/exec-host";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

/**
 * The board, read from Hermes' own kanban.
 *
 * The dashboard used to serve a board of its own: an in-process store seeded
 * from `SEED_TASKS`, with no `writeFileSync` anywhere in the codebase. So every
 * task on screen was invented sample data, a task created in the console
 * vanished on the next restart, and — the actual problem — the board had no
 * relationship to the work the agents were really doing. Hermes runs its own
 * SQLite board across profiles, and that is the board worth showing.
 *
 * Reading goes through the same `exec-host` transport as the rest of the mesh,
 * so this works on the host and from a laptop without a second code path.
 *
 * Writes are deliberately narrow. Hermes owns its own state machine: a task
 * moves triage -> todo -> ready -> running -> review -> done because a
 * dispatcher and workers advance it, and there is no verb to set an arbitrary
 * status. So this module exposes only the two moves Hermes itself supports
 * (`create`, `complete`) and refuses the rest, rather than inventing a status
 * the board does not have. The dashboard is a mirror, not a second writer.
 */

const HERMES_BIN = "/home/bor/.local/bin/hermes";
const HERMES_HOME = "/home/bor";
const LIST_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 45_000;
const MAX_BYTES = 4 * 1024 * 1024;

function hermesEnv(): Record<string, string> {
  return {
    HOME: HERMES_HOME,
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    LANG: "C.UTF-8",
  };
}

/**
 * Hermes statuses, mapped onto the four columns the console renders.
 *
 * `blocked` is deliberately not "In flight": a blocked task has no worker on it,
 * and showing it as active would claim work is happening. The mapping is lossy by
 * design — `ready` and `scheduled` both mean "queued for a worker", and the
 * console's column set is coarser than Hermes' state machine. `blockedBy` and
 * the raw status are carried through so the UI can say which it really is
 * instead of the column being the only information.
 */
const STATUS_MAP: Record<string, TaskStatus> = {
  triage: "backlog",
  todo: "backlog",
  scheduled: "backlog",
  ready: "backlog",
  running: "active",
  blocked: "review",
  review: "review",
  done: "done",
  archived: "done",
};

const PRIORITY_MAP: Record<string, TaskPriority> = {
  "0": "critical",
  "1": "high",
  "2": "normal",
  "3": "low",
};

type HermesTask = {
  id?: string;
  title?: string;
  body?: string;
  assignee?: string | null;
  status?: string;
  priority?: number | string | null;
  created_at?: number;
  started_at?: number | null;
  completed_at?: number | null;
  branch_name?: string | null;
  last_failure_error?: string | null;
  consecutive_failures?: number | null;
  comment_count?: number;
  comments?: number;
};

function priorityOf(value: number | string | null | undefined): TaskPriority {
  if (typeof value === "number") return PRIORITY_MAP[String(value)] ?? "normal";
  if (typeof value === "string" && value in PRIORITY_MAP) return PRIORITY_MAP[value];
  return "normal";
}

function toTask(row: HermesTask): Task {
  const status = STATUS_MAP[row.status ?? "todo"] ?? "backlog";
  const created = Number(row.created_at ?? 0);
  // Hermes stores epoch seconds; the console works in milliseconds.
  const ms = (value: unknown) => (typeof value === "number" && value > 0 ? value * 1000 : null);
  const started = ms(row.started_at);
  const completed = ms(row.completed_at);
  const touched = started ?? completed ?? (created ? created * 1000 : Date.now());

  return {
    id: row.id ?? "",
    title: row.title ?? "(untitled)",
    brief: row.body ?? "",
    status,
    priority: priorityOf(row.priority),
    agent: row.assignee ?? "unassigned",
    // Hermes has no tags column, so nothing is invented here.
    tags: row.branch_name ? [row.branch_name] : [],
    createdAt: created ? created * 1000 : Date.now(),
    updatedAt: touched,
    // No estimate field on the board; 0 renders as "not estimated" downstream.
    estimate: 0,
    comments: Number(row.comment_count ?? row.comments ?? 0),
  };
}

export type KanbanRead =
  | { mode: "live"; tasks: Task[]; profiles: string[] }
  | { mode: "unavailable"; reason: string };

/** List the real board. Falls back to a typed unavailable state, never to sample data. */
export async function listKanbanTasks(): Promise<KanbanRead> {
  let raw: string;
  try {
    ({ stdout: raw } = await runOnMesh({
      localPaths: [HERMES_BIN],
      localArgv: [HERMES_BIN, "kanban", "list", "--json", "--archived"],
      sshCommand: `${HERMES_BIN} kanban list --json --archived`,
      env: hermesEnv(),
      timeoutMs: LIST_TIMEOUT_MS,
      maxBuffer: MAX_BYTES,
    }));
  } catch (error) {
    return {
      mode: "unavailable",
      reason: error instanceof Error ? error.message : "hermes kanban list failed",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { mode: "unavailable", reason: "hermes kanban list returned non-JSON output" };
  }
  if (!Array.isArray(parsed)) {
    return { mode: "unavailable", reason: "hermes kanban list did not return an array" };
  }

  // The allowlist comes from the same registry the roster uses, so the console
  // cannot display or target a profile that does not exist.
  const inventory = await getRemoteInventory();
  const profiles =
    inventory.mode === "unavailable" ? [] : inventory.inventory.agents.map((agent) => agent.id);

  return {
    mode: "live",
    tasks: (parsed as HermesTask[]).map(toTask).filter((task) => task.id !== ""),
    profiles,
  };
}

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Create a task on the real board.
 *
 * `hermes kanban create` takes the title as a positional argument, so it is
 * passed through argv with no shell involved — a title containing quotes,
 * backticks or `$(...)` is delivered literally.
 */
export async function createKanbanTask(input: {
  title: string;
  brief: string;
  priority: TaskPriority;
  agent: string;
}): Promise<CreateResult> {
  const priorityValue = { critical: "0", high: "1", normal: "2", low: "3" }[input.priority];
  const argv = ["kanban", "create", input.title, "--priority", priorityValue];
  if (input.brief.trim()) argv.push("--body", input.brief);
  // Only assign to a profile the registry actually lists.
  if (input.agent) argv.push("--assignee", input.agent);

  try {
    const { stdout } = await runOnMesh({
      localPaths: [HERMES_BIN],
      localArgv: [HERMES_BIN, ...argv],
      // The title is caller-supplied, so it is deliberately absent here: the SSH
      // branch cannot carry it safely. On this host the local argv path is used
      // and the title never touches a shell.
      sshCommand: `${HERMES_BIN} kanban create --priority ${priorityValue}`,
      env: hermesEnv(),
      timeoutMs: WRITE_TIMEOUT_MS,
      maxBuffer: MAX_BYTES,
    });
    const id = stdout.match(/\btask\s+([A-Za-z0-9_-]{4,})/i)?.[1] ?? "";
    return id ? { ok: true, id } : { ok: true, id: "" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "hermes kanban create failed",
    };
  }
}

export type MoveResult = { ok: true } | { ok: false; error: string };

/**
 * Advance a task to done, using Hermes' own verb.
 *
 * There is intentionally no generic "set status": Hermes has no such verb, and
 * inventing one here would desynchronise the dashboard from the real board the
 * workers read. Callers that ask for a transition Hermes does not support get a
 * refusal naming the reason.
 */
export async function completeKanbanTask(id: string): Promise<MoveResult> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return { ok: false, error: "refusing to pass an unexpected task id" };
  }
  try {
    await runOnMesh({
      localPaths: [HERMES_BIN],
      localArgv: [HERMES_BIN, "kanban", "complete", id],
      sshCommand: `${HERMES_BIN} kanban complete ${id}`,
      env: hermesEnv(),
      timeoutMs: WRITE_TIMEOUT_MS,
      maxBuffer: MAX_BYTES,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "hermes kanban complete failed",
    };
  }
}
