import type { TaskPriority, TaskStatus } from "@/lib/types";

export const COLUMNS: Array<{ id: TaskStatus; label: string; hint: string; accent: string }> = [
  { id: "backlog", label: "Backlog", hint: "Queued intent", accent: "var(--ink-subtle)" },
  { id: "active", label: "In flight", hint: "Agents working", accent: "var(--brand)" },
  { id: "review", label: "Review", hint: "Awaiting sign-off", accent: "var(--warn)" },
  { id: "done", label: "Shipped", hint: "Last 7 days", accent: "var(--ok)" },
];

export const PRIORITY_TONE: Record<TaskPriority, { label: string; color: string }> = {
  critical: { label: "Critical", color: "var(--danger)" },
  high: { label: "High", color: "var(--warn)" },
  normal: { label: "Normal", color: "var(--info)" },
  low: { label: "Low", color: "var(--ink-subtle)" },
};
