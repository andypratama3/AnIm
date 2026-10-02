"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { FireIcon } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMesh } from "@/lib/hooks/use-data";
import { useConsole } from "@/components/providers/console-provider";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

function loadTone(load: number | null): string {
  if (load == null) return "var(--ink-subtle)";
  if (load >= 85) return "var(--danger)";
  if (load >= 65) return "var(--warn)";
  if (load >= 40) return "var(--brand)";
  return "var(--ok)";
}

export function LoadHeatmap({
  cells,
  agents,
  className,
}: {
  cells: import("@/lib/types").HeatCell[];
  agents: string[];
  className?: string;
}) {
  const { setFocusAgent } = useConsole();
  const [hover, setHover] = useState<{ agent: string; hour: number; load: number } | null>(null);

  const grid = useMemo(() => {
    const map = new Map<string, number>();
    for (const cell of cells) map.set(`${cell.agent}:${cell.hour}`, cell.load);
    return map;
  }, [cells]);

  const hours = Array.from({ length: 24 }, (_, index) => index);
  const labels = [0, 4, 8, 12, 16, 20];

  if (cells.length === 0) {
    return (
      <Card tone="plate" className={cn("p-5", className)}>
        <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Peer load · 24h</h2>
        <p className="mt-1 text-[12px] text-ink-subtle">
          No load metric exported by the host — the collector reports a point-in-time snapshot only.
        </p>
        <p className="py-8 text-center font-mono text-[12px] text-ink-subtle">—</p>
      </Card>
    );
  }

  return (
    <Card tone="plate" className={cn("p-5", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Peer load · 24h</h2>
          <p className="mt-1 text-[12px] text-ink-subtle">
            Where the mesh is saturated. Hover for the exact percentage.
          </p>
        </div>
        <Badge tone="warn">
          <FireIcon size={12} weight="fill" />
          peak tracked
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[30rem]">
          <div className="mb-1.5 flex items-center gap-1.5 pl-[5.5rem]">
            {labels.map((hour) => (
              <span
                key={hour}
                className="w-[calc((100%/24)*6-2px)] shrink-0 font-mono text-[9px] text-ink-subtle"
              >
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          <div className="space-y-1">
            {agents.map((agent) => (
              <div key={agent} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFocusAgent(agent)}
                  className="w-[5rem] shrink-0 truncate text-left font-mono text-[10px] text-ink-subtle transition-colors hover:text-ink"
                >
                  {agent}
                </button>
                <div className="flex flex-1 gap-[2px]">
                  {hours.map((hour) => {
                    const load = grid.get(`${agent}:${hour}`) ?? 0;
                    const active = hover?.agent === agent && hover.hour === hour;
                    return (
                      <motion.button
                        key={hour}
                        type="button"
                        onMouseEnter={() => setHover({ agent, hour, load })}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover({ agent, hour, load })}
                        onBlur={() => setHover(null)}
                        initial={{ opacity: 0, scaleY: 0.4 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        transition={{ duration: 0.5, delay: hour * 0.008, ease: [0.32, 0.72, 0, 1] }}
                        className="h-4 flex-1 rounded-[3px] transition-transform duration-300 hover:scale-y-150 focus-visible:scale-y-150"
                        style={{
                          background: `color-mix(in oklab, ${loadTone(load)} ${18 + load * 0.7}%, transparent)`,
                          outline: active ? `1px solid ${loadTone(load)}` : undefined,
                        }}
                        aria-label={`${agent} at ${hour}:00 — ${Math.round(load)}% load`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-ink">
              {hover
                ? `${hover.agent} · ${formatClock(hover.hour * 3_600_000)} — ${Math.round(hover.load)}%`
                : "hover a cell"}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-ink-subtle">low</span>
              {[18, 38, 58, 78, 95].map((opacity) => (
                <span
                  key={opacity}
                  className="h-2.5 w-5 rounded-[3px]"
                  style={{ background: `color-mix(in oklab, var(--brand) ${opacity}%, transparent)` }}
                />
              ))}
              <span className="text-[10px] text-ink-subtle">high</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function HeatmapInline({ cells, agent }: { cells: import("@/lib/types").HeatCell[]; agent: string }) {
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const known = cells.some((cell) => cell.agent === agent);
  if (!known) {
    return <span className="font-mono text-[10px] text-ink-subtle">—</span>;
  }
  return (
    <div className="flex gap-[2px]">
      {hours.map((hour) => {
        const load = cells.find((cell) => cell.agent === agent && cell.hour === hour)?.load ?? 0;
        return (
          <span
            key={hour}
            className="h-3 w-1 rounded-[2px]"
            style={{ background: `color-mix(in oklab, ${loadTone(load)} ${18 + load * 0.7}%, transparent)` }}
          />
        );
      })}
    </div>
  );
}

export function PeerLoadBars() {
  const { data } = useMesh();
  if (!data) return null;

  return (
    <div className="space-y-2.5">
      {data.agents.map((agent) => (
        <div key={agent.id} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate font-mono text-[11px] text-ink-subtle">
            {agent.id}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            {agent.load == null ? null : (
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${agent.load}%` }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              style={{
                background: `linear-gradient(90deg, color-mix(in oklab, ${loadTone(agent.load)} 45%, transparent), ${loadTone(agent.load)})`,
              }}
            />
            )}
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-[11px] text-ink">
            {agent.load == null ? "\u2014" : `${Math.round(agent.load)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}
