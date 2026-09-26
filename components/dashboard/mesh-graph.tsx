"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useConsole } from "@/components/providers/console-provider";
import { MESH_LINKS } from "@/lib/data/profiles";
import { STATUS_COLOR, AgentGlyph } from "@/components/dashboard/agent-glyph";
import { Badge } from "@/components/ui/badge";
import { formatMs, formatPercent } from "@/lib/format";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { hottestAgent, meanLatency } from "@/lib/data/mesh-metrics";
import {
  activeAgents,
  bubbleRadius,
  labelOffsets,
  visibleLinks,
  CENTER,
  RADIUS,
  SIZE,
} from "@/lib/data/mesh-layout";

export function MeshGraph({ agents, className }: { agents: Agent[]; className?: string }) {
  const { setFocusAgent, focusAgent } = useConsole();
  const [hovered, setHovered] = useState<string | null>(null);

  // Only agents that are actually up get a slot on the ring, and the ring
  // divides by how many are left. Sizing the layout from the full roster while
  // drawing the active subset is what packed 26 nodes into a space that could
  // hold a handful.
  const visible = useMemo(() => activeAgents(agents), [agents]);
  const links = useMemo(() => visibleLinks(MESH_LINKS, agents), [agents]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    visible.forEach((agent, index) => {
      const angle = (index / visible.length) * Math.PI * 2 - Math.PI / 2;
      map.set(agent.id, {
        x: CENTER + Math.cos(angle) * RADIUS,
        y: CENTER + Math.sin(angle) * RADIUS,
      });
    });
    return map;
  }, [visible]);

  const active = hovered ?? focusAgent;

  if (agents.length === 0) return null;

  if (visible.length === 0) {
    return (
      <div
        className={cn(
          "flex aspect-square w-full items-center justify-center px-6 text-center text-sm text-ink-subtle",
          className,
        )}
      >
        No agent is up right now — all {agents.length} report offline, so there is
        no topology to draw.
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full" role="img" aria-label="Mesh topology">
        <defs>
          <radialGradient id="mesh-core">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={CENTER} cy={CENTER} r={RADIUS + 78} fill="url(#mesh-core)" />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--hairline)"
          strokeDasharray="2 8"
        />
        <circle cx={CENTER} cy={CENTER} r={RADIUS - 62} fill="none" stroke="var(--hairline)" />

        {links.map((link, index) => {
          const from = positions.get(link.source);
          const to = positions.get(link.target);
          if (!from || !to) return null;
          const related = !active || active === link.source || active === link.target;
          const hot = link.strength > 0.78;

          return (
            <g key={`${link.source}-${link.target}`} opacity={related ? 1 : 0.12}>
              <path
                id={`edge-${index}`}
                d={`M ${from.x} ${from.y} Q ${CENTER} ${CENTER} ${to.x} ${to.y}`}
                fill="none"
                stroke="var(--brand)"
                strokeOpacity={active ? 0.5 : 0.22}
                strokeWidth={link.strength * 1.9}
                strokeLinecap="round"
              />
              {hot ? (
                <>
                  <path
                    d={`M ${from.x} ${from.y} Q ${CENTER} ${CENTER} ${to.x} ${to.y}`}
                    fill="none"
                    stroke="var(--brand-2)"
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    strokeDasharray="6 26"
                    style={{ animation: "var(--animate-dash-flow)" }}
                  />
                  <circle r={2.6} fill="var(--brand-2)">
                    <animateMotion
                      dur={`${4.2 + (index % 5) * 0.6}s`}
                      repeatCount="indefinite"
                      begin={`${(index % 7) * 0.5}s`}
                    >
                      <mpath href={`#edge-${index}`} />
                    </animateMotion>
                  </circle>
                </>
              ) : null}
            </g>
          );
        })}

        {visible.map((agent) => {
          const point = positions.get(agent.id);
          if (!point) return null;
          const dimmed = Boolean(active) && active !== agent.id;
          const tone = STATUS_COLOR[agent.status];

          const r = bubbleRadius(agent.id);
          const label = labelOffsets(agent.id);

          return (
            <g
              key={agent.id}
              transform={`translate(${point.x} ${point.y})`}
              className="cursor-pointer"
              opacity={dimmed ? 0.35 : 1}
              onMouseEnter={() => setHovered(agent.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setFocusAgent(agent.id)}
            >
              <motion.circle
                r={r}
                fill="var(--surface)"
                stroke={tone}
                strokeWidth={agent.id === active ? 2.4 : 1.2}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: "center" }}
              />
              {agent.status === "busy" || agent.status === "degraded" ? (
                <circle r={r + 10} fill="none" stroke={tone} strokeWidth={1} opacity={0.5}>
                  <animate
                    attributeName="r"
                    values={`${r + 2};${r + 16};${r + 2}`}
                    dur="3.4s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.6;0;0.6"
                    dur="3.4s"
                    repeatCount="indefinite"
                  />
                </circle>
              ) : null}
              <text
                textAnchor="middle"
                dy={label.glyph}
                className="fill-[var(--ink)]"
                style={{ fontSize: label.glyphFont, fontWeight: 600 }}
              >
                {agent.id === "default" ? "ORCH" : agent.id.slice(0, 4).toUpperCase()}
              </text>
              <text
                textAnchor="middle"
                dy={label.name}
                className="fill-[var(--ink-subtle)]"
                style={{ fontSize: label.nameFont, letterSpacing: "0.08em" }}
              >
                {agent.id}
              </text>
              <text
                textAnchor="middle"
                dy={label.port}
                className="fill-[var(--ink-subtle)]"
                style={{ fontSize: label.portFont, fontFamily: "var(--font-mono)" }}
              >
                :{agent.port}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2">
        {visible.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => setFocusAgent(agent.id)}
            className={cn(
              "pointer-events-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-all duration-500 hover:-translate-y-0.5",
              agent.id === active
                ? "border-brand/40 bg-brand/10 text-ink"
                : "border-hairline bg-surface/70 text-ink-muted",
            )}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ background: STATUS_COLOR[agent.status] }}
            />
            {agent.id}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MeshLegend({ agents }: { agents: Agent[] }) {
  // A collector that never reports load yields `null` for every agent, and
  // sorting those alone would still hand back the first profile. That badge
  // would read "hottest: frontend · —" and name a peak nobody measured, so the
  // roll-ups live in `mesh-metrics.ts` where they are unit-tested.
  const avgLatency = meanLatency(agents);
  const busiest = hottestAgent(agents);
  const shown = activeAgents(agents);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="brand">{visibleLinks(MESH_LINKS, agents).length} links</Badge>
      <Badge tone="neutral">
        {shown.length} of {agents.length} active
      </Badge>
      <Badge tone="neutral">
        <span className="font-mono">{formatMs(avgLatency)}</span> mean hop
      </Badge>
      {busiest ? (
        <Badge tone="warn">
          hottest: {busiest.id} · {formatPercent(busiest.load, 0)}
        </Badge>
      ) : null}
    </div>
  );
}

export function AgentStrip({
  agents,
  onPick,
}: {
  agents: Agent[];
  onPick: (id: string) => void;
}) {
  const { focusAgent } = useConsole();
  return (
    <div className="flex flex-wrap gap-2">
      {agents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          onClick={() => onPick(agent.id)}
          className={cn(
            "group flex items-center gap-2.5 rounded-2xl border px-2.5 py-2 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:shadow-plate",
            focusAgent === agent.id
              ? "border-brand/40 bg-brand/10"
              : "border-hairline bg-surface-2/50 hover:border-hairline-strong",
          )}
        >
          <AgentGlyph id={agent.id} accent={agent.accent} size={28} status={agent.status} pulse={false} />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[12px] font-medium">{agent.id}</span>
            <span className="font-mono text-[10px] text-ink-subtle">:{agent.port}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
