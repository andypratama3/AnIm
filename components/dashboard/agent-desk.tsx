"use client";

import { motion, AnimatePresence } from "motion/react";
import { AgentGlyph, STATUS_COLOR } from "@/components/dashboard/agent-glyph";
import { Badge, Dot } from "@/components/ui/badge";
import { formatMs, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MonitorIcon, CoffeeIcon, LightningIcon, ChatCircleIcon } from "@phosphor-icons/react";
import type { Agent } from "@/lib/types";

interface AgentDeskProps {
  agent: Agent;
  activity?: { count: number; lastActivity: number };
  isFocused?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export function AgentDesk({
  agent,
  activity,
  isFocused = false,
  onClick,
  compact = false,
}: AgentDeskProps) {
  const isWorking = agent.status === "busy";
  const isOnline = agent.status !== "offline";
  const loadPercent = agent.load ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        compact
          ? "p-3"
          : "p-4",
        isWorking
          ? "border-brand/40 bg-brand/5 shadow-[0_0_30px_-10px_var(--brand)]"
          : isOnline
            ? "border-hairline bg-surface-2/50 hover:border-hairline-strong hover:bg-surface-2"
            : "border-hairline bg-surface-1/30 opacity-60",
        isFocused && "ring-2 ring-brand/50 ring-offset-2 ring-offset-background",
        onClick && "cursor-pointer",
      )}
    >
      {/* Status glow effect */}
      <AnimatePresence>
        {isWorking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 bg-gradient-to-br from-brand/20 to-transparent"
          />
        )}
      </AnimatePresence>

      {/* Desk surface */}
      <div className="relative">
        {/* Header: Agent info */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <AgentGlyph
              id={agent.id}
              accent={agent.accent}
              size={compact ? 24 : 32}
              status={agent.status}
              pulse={isWorking}
            />
            <div className="min-w-0">
              <p className={cn(
                "font-medium truncate",
                compact ? "text-[12px]" : "text-[13px]"
              )}>
                {agent.id}
              </p>
              <p className={cn(
                "text-ink-subtle truncate",
                compact ? "text-[10px]" : "text-[11px]"
              )}>
                {agent.role}
              </p>
            </div>
          </div>
          <Badge
            tone={agent.status === "online" ? "ok" : agent.status === "busy" ? "brand" : agent.status === "degraded" ? "warn" : "neutral"}
            size="sm"
            className="shrink-0"
          >
            <Dot tone={STATUS_COLOR[agent.status]} pulse={isWorking} />
            {agent.status}
          </Badge>
        </div>

        {/* Work indicators */}
        {!compact && (
          <div className="space-y-2">
            {/* Monitor/screen showing current task */}
            <div className="relative rounded-xl border border-hairline bg-surface-3/50 p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MonitorIcon size={12} className="text-ink-subtle" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                  Current Task
                </span>
              </div>
              {isWorking ? (
                <div className="space-y-1.5">
                  <div className="h-1.5 rounded-full bg-surface-4 overflow-hidden">
                    <motion.div
                      className="h-full bg-brand"
                      initial={{ width: 0 }}
                      animate={{ width: `${loadPercent}%` }}
                      transition={{ duration: 1 }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-ink-subtle">Load</span>
                    <span className="font-mono text-brand">{formatPercent(loadPercent, 0)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-ink-muted italic">
                  {agent.status === "offline" ? "Agent offline" : "Idle - awaiting task"}
                </p>
              )}
            </div>

            {/* Activity indicators */}
            <div className="flex items-center gap-2">
              {activity && activity.count > 0 && (
                <div className="flex items-center gap-1 rounded-lg bg-surface-3/50 px-2 py-1">
                  <LightningIcon size={10} className="text-brand" />
                  <span className="text-[10px] font-mono text-ink">{activity.count} actions</span>
                </div>
              )}
              {agent.queue != null && agent.queue > 0 && (
                <div className="flex items-center gap-1 rounded-lg bg-surface-3/50 px-2 py-1">
                  <ChatCircleIcon size={10} className="text-brand-2" />
                  <span className="text-[10px] font-mono text-ink">{agent.queue} queued</span>
                </div>
              )}
            </div>

            {/* Coffee break indicator for low load */}
            {isOnline && !isWorking && loadPercent < 30 && (
              <div className="flex items-center gap-1.5 rounded-lg bg-ok/10 px-2 py-1">
                <CoffeeIcon size={10} className="text-ok" />
                <span className="text-[10px] text-ok">On break</span>
              </div>
            )}
          </div>
        )}

        {/* Compact mode stats */}
        {compact && (
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {isWorking && (
                <div className="h-1.5 w-16 rounded-full bg-surface-4 overflow-hidden">
                  <motion.div
                    className="h-full bg-brand"
                    initial={{ width: 0 }}
                    animate={{ width: `${loadPercent}%` }}
                    transition={{ duration: 1 }}
                  />
                </div>
              )}
              {activity && activity.count > 0 && (
                <span className="text-[10px] font-mono text-ink-subtle">
                  {activity.count} acts
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono text-ink-subtle">
              {formatMs(agent.latencyMs)}
            </span>
          </div>
        )}

        {/* Connection indicator when focused */}
        <AnimatePresence>
          {isFocused && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute -top-1 -right-1 size-4 rounded-full bg-brand shadow-lg"
            >
              <div className="absolute inset-0 rounded-full bg-brand animate-ping opacity-75" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
