"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  BuildingOfficeIcon,
  ChairIcon,
  DoorOpenIcon,
  FlowArrowIcon,
  PlugsConnectedIcon,
} from "@phosphor-icons/react";
import { Badge, Dot } from "@/components/ui/badge";
import { SectionCard } from "@/components/dashboard/page-header";
import { useConsole } from "@/components/providers/console-provider";
import { STATUS_COLOR } from "@/components/dashboard/agent-glyph";
import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/lib/types";

type LiveAgent = {
  id: string;
  displayName: string;
  title: string | null;
  department: string | null;
  reportsTo: string | null;
  port: number | null;
  gateway: "running" | "installed" | "missing";
  a2aReachable: boolean;
  status: AgentStatus;
  stateLabel: string;
};

type LivePayload = {
  mode: "live";
  latencyMs: number;
  collectMs: number;
  totals: { profiles: number; running: number; reachable: number; departments: number };
  agents: LiveAgent[];
};

type FloorState =
  | { status: "loading" }
  | { status: "live"; data: LivePayload }
  | { status: "unavailable"; reason: string };

const DEPARTMENTS: Record<string, string> = {
  "office-of-owner": "Office of the Owner",
  "product-operations": "Product & Operations",
  engineering: "Engineering",
  "knowledge-content": "Knowledge & Content",
  "commercial-finance": "Commercial & Finance",
};

const DEPARTMENT_ORDER = [
  "office-of-owner",
  "product-operations",
  "engineering",
  "knowledge-content",
  "commercial-finance",
];

function departmentLabel(key: string | null | undefined): string {
  if (!key) return "Unassigned";
  return DEPARTMENTS[key] ?? key;
}

export function OfficeFloor() {
  const { setFocusAgent, focusAgent } = useConsole();
  const [state, setState] = useState<FloorState>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/mesh-live", { cache: "no-store" });
      const body = (await response.json()) as LivePayload & { mode: string; reason?: string };
      if (response.ok && body.mode === "live") {
        setState({ status: "live", data: body as LivePayload });
      } else {
        setState({ status: "unavailable", reason: body.reason ?? `HTTP ${response.status}` });
      }
    } catch (err) {
      setState({ status: "unavailable", reason: err instanceof Error ? err.message : "network failure" });
    }
  }, []);

  useEffect(() => {
    const kick = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const rooms = useMemo(() => {
    if (state.status !== "live") return [];
    const byDept = new Map<string, LiveAgent[]>();
    for (const agent of state.data.agents) {
      const key = agent.department ?? "unassigned";
      const list = byDept.get(key);
      if (list) list.push(agent);
      else byDept.set(key, [agent]);
    }
    const keys = DEPARTMENT_ORDER.filter((key) => byDept.has(key));
    for (const key of byDept.keys()) {
      if (!DEPARTMENT_ORDER.includes(key)) keys.push(key);
    }
    return keys.map((key) => ({
      key,
      label: departmentLabel(key),
      agents: byDept.get(key) ?? [],
    }));
  }, [state]);

  return (
    <SectionCard
      title="Office floor"
      description="The mesh drawn as an office: one room per division, one desk per role. Gateway state, A2A reachability and reporting lines are read live from the host — nothing here is simulated."
      className={cn("h-fit")}
      actions={
        <Badge tone="neutral" className="font-mono text-[10px]">
          <BuildingOfficeIcon size={11} />
          {rooms.length} rooms
        </Badge>
      }
      padding="none"
      bodyClassName="px-4 pb-4 sm:px-5"
    >
      {state.status === "loading" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      ) : state.status === "unavailable" ? (
        <div className="rounded-2xl border border-warn/30 bg-warn/5 p-4 text-[12px] text-ink-muted">
          Office floor unavailable — {state.reason}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room, roomIndex) => {
            const liveCount = room.agents.filter((agent) => agent.gateway === "running").length;
            const reachable = room.agents.filter((agent) => agent.a2aReachable).length;
            return (
              <motion.div
                key={room.key}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: roomIndex * 0.09, duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface/50 transition-colors duration-300 hover:border-hairline-strong"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="flex items-center justify-between gap-2 border-b border-hairline px-3.5 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <DoorOpenIcon size={14} className="shrink-0 text-ink-subtle" />
                    <span className="truncate text-[12.5px] font-semibold tracking-[-0.01em] text-ink">
                      {room.label}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-ink-subtle">
                    <PlugsConnectedIcon size={10} className={liveCount > 0 ? "text-[color:var(--ok)]" : undefined} />
                    {liveCount}/{room.agents.length} live
                    {reachable > 0 ? (
                      <Badge tone="ok" size="sm" className="ml-0.5">
                        {reachable} A2A
                      </Badge>
                    ) : null}
                  </span>
                </div>
                <ul className="flex-1 space-y-1 px-2 py-2">
                  {room.agents.map((agent, agentIndex) => {
                    const tone = STATUS_COLOR[agent.status];
                    const active = focusAgent === agent.id;
                    return (
                      <motion.li
                        key={agent.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          delay: roomIndex * 0.09 + 0.12 + agentIndex * 0.035,
                          duration: 0.4,
                          ease: [0.32, 0.72, 0, 1],
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setFocusAgent(agent.id)}
                          className={cn(
                            "relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all duration-300",
                            active
                              ? "bg-brand/10 ring-1 ring-brand/40"
                              : "hover:bg-surface-2/80",
                          )}
                        >
                          <span
                            className="relative grid size-7 shrink-0 place-items-center rounded-lg"
                            style={{ color: tone }}
                          >
                            <ChairIcon size={15} />
                            {agent.gateway === "running" ? (
                              <motion.span
                                className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full"
                                style={{ backgroundColor: tone }}
                                animate={{ scale: [1, 1.5, 1], opacity: [0.9, 0.4, 0.9] }}
                                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                              />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate font-mono text-[12px] font-medium text-ink">
                                {agent.id}
                              </span>
                              {agent.a2aReachable ? (
                                <Dot tone="var(--ok)" pulse />
                              ) : null}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-ink-subtle">
                              {agent.title ?? agent.displayName}
                            </span>
                            {agent.reportsTo && agent.reportsTo !== agent.id ? (
                              <span className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-subtle">
                                <FlowArrowIcon size={9} />
                                <span className="truncate font-mono">{agent.reportsTo}</span>
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-mono text-[10.5px] text-ink-subtle">
                            :{agent.port ?? "—"}
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                </ul>
              </motion.div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
