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

  const counts: Record<string, number> = {
    "/agents": data?.agents.length ?? 0,
    "/kanban":
      data?.agents.reduce((sum, agent) => sum + (agent.queue ?? 0), 0) ??
      data?.totals.tasks ??
      0,
  };

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
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
          Peers
        </p>
        <ul className="space-y-0.5">
          {(data?.agents ?? []).slice(0, 5).map((agent) => (
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
