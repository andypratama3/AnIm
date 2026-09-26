"use client";

import { Suspense, useEffect, useState } from "react";
import { useMesh, useBoard } from "@/lib/hooks/use-data";
import { useConsole } from "@/components/providers/console-provider";
import { COLUMNS } from "@/lib/data/board";
import { PageHeader, SectionCard } from "@/components/dashboard/page-header";
import { KanbanBoard } from "@/components/dashboard/kanban-board";
import { AgentStrip } from "@/components/dashboard/mesh-graph";
import { PeerLoadBars } from "@/components/dashboard/load-heatmap";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";

function KanbanInner() {
  // /kanban?new=1 deep link from the overview button and the command palette.
  // Read in an effect (not during render) so the Suspense boundary stays safe.
  const [autoCreate, setAutoCreate] = useState(false);
  useEffect(() => {
    // Deferred: an effect body must not setState synchronously, and reading the
    // flag during render would desync server and client markup.
    const id = window.setTimeout(() => {
      const flag = new URLSearchParams(window.location.search).get("new");
      if (flag === "1") {
        setAutoCreate(true);
        window.history.replaceState(null, "", "/kanban");
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const { data } = useMesh();
  const { setFocusAgent } = useConsole();
  const { data: board, mutate } = useBoard();
  const agents = data?.agents ?? [];
  const tasks = board?.tasks ?? [];

  const counts = COLUMNS.map((column) => ({
    ...column,
    total: tasks.filter((task) => task.status === column.id).length,
  }));

  const totalHours = tasks.reduce((sum, task) => sum + task.estimate, 0);
  const blocked = tasks.filter((task) => task.blockedBy).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow"
        title="Task flow"
        description="Work moving through the mesh. Drag a card between columns to re-route it, or open one to reassign the owning peer."
        meta={
          <>
            <Badge tone="brand">{tasks.length} tasks</Badge>
            <Badge tone="neutral">{totalHours}h estimated</Badge>
            {blocked > 0 ? <Badge tone="warn">{blocked} blocked</Badge> : null}
            {board ? (
              <Badge tone="neutral">synced {formatRelative(board.generatedAt)}</Badge>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map((column) => (
          <div key={column.id} className="plate rounded-[1.25rem] p-3.5">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full" style={{ background: column.accent }} />
              <span className="text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                {column.label}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[22px] font-semibold text-ink">{column.total}</p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-ink-subtle">{column.hint}</p>
          </div>
        ))}
      </div>

      <SectionCard
        title="Board"
        description="Optimistic updates with rollback if the gateway rejects the move."
        padding="none"
        bodyClassName="px-0 sm:px-0"
        actions={
          <button
            type="button"
            onClick={() => void mutate()}
            className="text-[11px] text-ink-subtle transition-colors hover:text-ink"
          >
            resync
          </button>
        }
      >
        <Suspense fallback={<div className="h-96 animate-pulse bg-surface-2/40" />}>
          <div className="p-4 sm:p-5">
            <KanbanBoard autoCreate={autoCreate} />
          </div>
        </Suspense>
      </SectionCard>

      <section className="grid grid-cols-1 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SectionCard title="Owning peers" description="Tap a peer to inspect its load.">
          <AgentStrip agents={agents} onPick={setFocusAgent} />
          <div className="mt-4 border-t border-hairline pt-4">
            <PeerLoadBars />
          </div>
        </SectionCard>

        <SectionCard title="How routing works" description="Column semantics for the orchestrator.">
          <dl className="space-y-3 text-[12.5px]">
            {COLUMNS.map((column) => (
              <div key={column.id} className="flex gap-3">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full"
                  style={{ background: column.accent }}
                />
                <div>
                  <dt className="font-medium text-ink">{column.label}</dt>
                  <dd className="text-ink-subtle">{column.hint}</dd>
                </div>
              </div>
            ))}
          </dl>
        </SectionCard>
      </section>
    </div>
  );
}

export default function KanbanPage() {
  return (
    <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-[1.75rem] bg-surface-2" />}>
      <KanbanInner />
    </Suspense>
  );
}
