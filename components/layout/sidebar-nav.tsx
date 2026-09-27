"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  RobotIcon,
  PulseIcon,
  KanbanIcon,
  ChartLineUpIcon,
  NotebookIcon,
  GearSixIcon,
  SquaresFourIcon,
  CirclesThreePlusIcon,
  ChatDotsIcon,
} from "@phosphor-icons/react";
import { BRAND, NAV_GROUPS } from "@/lib/brand";
import { useMesh } from "@/lib/hooks/use-data";
import type { AgentStatus } from "@/lib/types";
import { useConsole } from "@/components/providers/console-provider";
import { cn } from "@/lib/utils";
import { Dot } from "@/components/ui/badge";
import { AgentGlyph } from "@/components/dashboard/agent-glyph";

const ICONS = {
  SquaresFour: SquaresFourIcon,
  Robot: RobotIcon,
  Pulse: PulseIcon,
  Kanban: KanbanIcon,
  ChartLineUp: ChartLineUpIcon,
  Notebook: NotebookIcon,
  ChatDots: ChatDotsIcon,
  GearSix: GearSixIcon,
} as const;

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data } = useMesh();
  const { setFocusAgent } = useConsole();

  // The badge shows a count only when something measured a real one.
  //
  // The old chain was `reduce((sum, a) => sum + (a.queue ?? 0), 0) ?? totals.tasks
  // ?? 0`. Two faults: `??` only fires on null/undefined, and a reduce over an
  // empty array returns `0`, so the totals fallback was unreachable; and
  // `queue ?? 0` treats an unreported queue as an empty one, so a roster where
  // some agents report and others do not sums to a number that is no agent's
  // queue and not the total. Queue depth and task count are also different
  // quantities, so they are never summed together.
  const queues = (data?.agents ?? [])
    .map((agent) => agent.queue)
    .filter((queue): queue is number => typeof queue === "number");
  const measuredQueue =
    data !== undefined && data.agents.length > 0 && queues.length === data.agents.length
      ? queues.reduce((sum, queue) => sum + queue, 0)
      : null;

  const counts: Record<string, number | null> = {
    "/agents": data?.agents.length ?? null,
    "/kanban": data?.totals.tasks ?? measuredQueue,
  };

  // The peer list used to be `agents.slice(0, 5)`, which took the first five rows
  // in registry order. With 26 profiles and 7 gateways actually running, that
  // showed whichever agents happened to sort first — including stopped ones —
  // and hid live ones, so the panel titled "Peers" did not answer "who is
  // running right now". Active agents are the reason this list exists, so they
  // lead; the rest follow so the panel still gives context, with a count so
  // nothing is silently truncated.
  const all = data?.agents ?? [];
  const isActive = (status: AgentStatus) => status !== "offline";
  const activeCount = all.filter((agent) => isActive(agent.status)).length;

  // `busy` and `degraded` are the two states worth surfacing first; among equals
  // keep registry order so the panel does not reshuffle on every poll. The sort
  // is stable in every engine that matters here, but the status key is explicit
  // so ordering never depends on that.
  const STATUS_RANK: Record<AgentStatus, number> = {
    busy: 0,
    degraded: 1,
    online: 2,
    offline: 3,
  };
  const ranked = [...all].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  const PEER_LIMIT = 8;
  const visiblePeers = ranked.slice(0, PEER_LIMIT);
  const hiddenPeers = ranked.length - visiblePeers.length;

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group, index) => (
        <motion.div
          key={group.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 + index * 0.06, duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
        >
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = ICONS[item.icon as keyof typeof ICONS];
              const count = counts[item.href];

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] transition-colors duration-300",
                      active ? "text-ink" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-2xl border border-hairline bg-surface-2 shadow-plate"
                        transition={{ type: "spring", stiffness: 380, damping: 34 }}
                      />
                    ) : null}
                    <span
                      className={cn(
                        "relative grid size-7 shrink-0 place-items-center rounded-lg transition-colors duration-300",
                        active ? "text-brand" : "text-ink-subtle group-hover:text-ink-muted",
                      )}
                    >
                      <Icon size={16} weight={active ? "fill" : "regular"} />
                    </span>
                    <span className="relative flex-1 truncate font-medium">{item.label}</span>
                    {typeof count === "number" && count > 0 ? (
                      <span className="relative font-mono text-[10px] tabular-nums text-ink-subtle">
                        {count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
        className="px-1"
      >
        <div className="flex items-baseline justify-between px-2 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
            Peers
          </p>
          {data ? (
            <span
              className="text-[10px] tabular-nums text-ink-subtle"
              title={`${activeCount} of ${all.length} agents running`}
            >
              {activeCount}/{all.length} active
            </span>
          ) : null}
        </div>
        <ul className="space-y-0.5">
          {visiblePeers.map((agent) => (
            <li key={agent.id}>
              <button
                type="button"
                onClick={() => setFocusAgent(agent.id)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors duration-300 hover:bg-surface-2"
              >
                <AgentGlyph id={agent.id} accent={agent.accent} size={22} status={agent.status} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">
                  {agent.id}
                </span>
                <Dot
                  tone={
                    agent.status === "online"
                      ? "var(--ok)"
                      : agent.status === "busy"
                        ? "var(--brand)"
                        : agent.status === "degraded"
                          ? "var(--warn)"
                          : "var(--danger)"
                  }
                />
              </button>
            </li>
          ))}
        </ul>
        {hiddenPeers > 0 ? (
          <p className="px-2 pt-2 text-[10px] tabular-nums text-ink-subtle">
            +{hiddenPeers} more not shown
          </p>
        ) : null}
      </motion.div>
    </nav>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-3 px-1">
      <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--brand-3),var(--brand)_48%,var(--brand-2))] shadow-[0_8px_24px_-8px_var(--brand)] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:rotate-6">
        <CirclesThreePlusIcon size={20} weight="fill" className="text-white" />
        <span className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 [background:radial-gradient(circle_at_30%_20%,oklch(1_0_0/0.45),transparent_60%)]" />
      </span>
      {!compact ? (
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-none tracking-[-0.03em]">
            <span className="text-gradient">{BRAND.name}</span>
          </span>
          <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
            {BRAND.expansion}
          </span>
        </span>
      ) : null}
    </Link>
  );
}
