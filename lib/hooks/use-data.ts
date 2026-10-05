"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { useConsole } from "@/components/providers/console-provider";
import type {
  ActivityEvent,
  Agent,
  MeshSnapshot,
  Note,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/lib/types";

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
};

export type MeshResponse = MeshSnapshot;

export function useMesh() {
  const { live, interval } = useConsole();
  return useSWR<MeshResponse>("/api/mesh", fetcher, {
    refreshInterval: live ? interval : 0,
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 1_000,
  });
}

export function useActivity(filters: { kind?: string; level?: string; agent?: string; q?: string }) {
  const { live, interval } = useConsole();
  const params = new URLSearchParams();
  if (filters.kind && filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.level && filters.level !== "all") params.set("level", filters.level);
  if (filters.agent && filters.agent !== "all") params.set("agent", filters.agent);
  if (filters.q) params.set("q", filters.q);
  const key = `/api/activity?${params.toString()}`;

  return useSWR<{ events: ActivityEvent[]; total: number; generatedAt: number }>(key, fetcher, {
    refreshInterval: live ? Math.max(interval, 6000) : 0,
    keepPreviousData: true,
  });
}

export function useBoard() {
  const { live, interval } = useConsole();
  return useSWR<{ tasks: Task[]; generatedAt: number }>("/api/board", fetcher, {
    refreshInterval: live ? Math.max(interval, 8000) : 0,
    keepPreviousData: true,
  });
}

export function useNotes(filters: { folder?: string; q?: string }) {
  const params = new URLSearchParams();
  if (filters.folder) params.set("folder", filters.folder);
  if (filters.q) params.set("q", filters.q);
  return useSWR<{
    notes: Note[];
    folders: string[];
    generatedAt: number;
    source: { kind: string; live: boolean; reason?: string; path?: string };
  }>(`/api/notes?${params.toString()}`, fetcher, {
    revalidateOnFocus: true,
  });
}

export function useMoveTask() {
  const board = useBoard();
  const [isMutating, setPending] = useState(false);
  const move = useCallback(
    async (
      id: string,
      status: TaskStatus,
    ): Promise<{ ok: true } | { ok: false; reason: string; detail?: string }> => {
      setPending(true);
      try {
        await board.mutate(
          async (current) => {
            const response = await fetch("/api/board", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id, status }),
            });
            const payload = (await response.json().catch(() => null)) as {
              task?: Task;
              error?: string;
              detail?: string;
            } | null;
            if (!response.ok) {
              throw Object.assign(
                new Error(payload?.error ?? `Move rejected (${response.status})`),
                { detail: payload?.detail, status: response.status },
              );
            }
            if (!current || !payload?.task) return current;
            return {
              ...current,
              tasks: current.tasks.map((t) => (t.id === id ? payload.task as Task : t)),
            };
          },
          {
            optimisticData: (current) =>
              current
                ? {
                    ...current,
                    tasks: current.tasks.map((task) =>
                      task.id === id ? { ...task, status, updatedAt: Date.now() } : task,
                    ),
                  }
                : { tasks: [], generatedAt: Date.now() },
            rollbackOnError: true,
            revalidate: false,
          },
        );
        return { ok: true };
      } catch (error) {
        // The board is Hermes' own: it advances work itself and refuses most
        // console-initiated status writes. Report the refusal to the caller
        // instead of leaving a rejected promise on the floor.
        const failure = error as Error & { detail?: string };
        return { ok: false, reason: failure.message ?? "move rejected", detail: failure.detail };
      } finally {
        setPending(false);
      }
    },
    [board],
  );
  return { move, isMutating };
}

export function useCreateTask() {
  const board = useBoard();
  const [isMutating, setPending] = useState(false);
  const create = async (input: {
    title: string;
    brief: string;
    priority: TaskPriority;
    agent: string;
    status: TaskStatus;
    tags: string[];
    estimate: number;
  }): Promise<{ ok: true } | { ok: false; reason: string }> => {
    setPending(true);
    try {
      const response = await fetch("/api/board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        return { ok: false, reason: payload?.error ?? "Could not create task" };
      }
      await board.mutate();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: (error as Error).message ?? "Could not reach the board" };
    } finally {
      setPending(false);
    }
  };
  return { create, isMutating };
}

export function useDeleteTask() {
  const board = useBoard();
  const [isMutating, setPending] = useState(false);
  const remove = async (
    id: string,
  ): Promise<{ ok: true } | { ok: false; reason: string; detail?: string }> => {
    setPending(true);
    try {
      const response = await fetch(`/api/board?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          detail?: string;
        } | null;
        return {
          ok: false,
          reason: payload?.error ?? `Delete rejected (${response.status})`,
          detail: payload?.detail,
        };
      }
      await board.mutate();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: (error as Error).message ?? "Could not reach the board" };
    } finally {
      setPending(false);
    }
  };
  return { remove, isMutating };
}

export function useAgent(id: string | null, agents: Agent[] | undefined): Agent | undefined {
  return agents?.find((agent) => agent.id === id);
}
