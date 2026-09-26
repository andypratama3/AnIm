import { SEED_NOTES } from "@/lib/data/vault";
import { SEED_TASKS } from "@/lib/data/board";
import type { Note, Task, TaskStatus } from "@/lib/types";

type Store = {
  tasks: Task[];
  notes: Note[];
  approvals: Array<{ id: string; title: string; agent: string; requestedAt: number }>;
};

const globalStore = globalThis as typeof globalThis & { __animStore?: Store };

function seed(): Store {
  return {
    tasks: SEED_TASKS.map((task) => ({ ...task })),
    notes: SEED_NOTES.map((note) => ({ ...note })),
    approvals: [
      { id: "apr-1", title: "Publish mesh launch thread", agent: "social-media", requestedAt: Date.now() - 42 * 60_000 },
      { id: "apr-2", title: "Rotate production peer tokens", agent: "default", requestedAt: Date.now() - 3 * 3_600_000 },
      { id: "apr-3", title: "Freeze config revision r22", agent: "principal-engineer", requestedAt: Date.now() - 26 * 3_600_000 },
    ],
  };
}

export function store(): Store {
  if (!globalStore.__animStore) globalStore.__animStore = seed();
  return globalStore.__animStore;
}

export function moveTask(id: string, status: TaskStatus): Task | undefined {
  const db = store();
  const task = db.tasks.find((item) => item.id === id);
  if (!task) return undefined;
  task.status = status;
  task.updatedAt = Date.now();
  return task;
}

export function addTask(input: Omit<Task, "id" | "createdAt" | "updatedAt" | "comments">): Task {
  const db = store();
  const numbers = db.tasks.map((task) => Number(task.id.replace("TSK-", "")) || 0);
  const task: Task = {
    ...input,
    id: `TSK-${Math.max(100, ...numbers) + 1}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    comments: 0,
  };
  db.tasks.unshift(task);
  return task;
}

export function removeTask(id: string): boolean {
  const db = store();
  const index = db.tasks.findIndex((task) => task.id === id);
  if (index === -1) return false;
  db.tasks.splice(index, 1);
  return true;
}
