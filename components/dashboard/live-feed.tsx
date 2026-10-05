"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowClockwiseIcon,
  BroadcastIcon,
  FunnelSimpleIcon,
  PauseIcon,
  PlayIcon,
  PulseIcon,
} from "@phosphor-icons/react";
import { useActivity } from "@/lib/hooks/use-data";
import { useConsole } from "@/components/providers/console-provider";
import { useDebouncedValue } from "@/lib/hooks/use-ui";
import { formatRelative, formatMs, formatCompact } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, Dot } from "@/components/ui/badge";
import { SectionCard, SegmentedControl } from "@/components/dashboard/page-header";
import { cn } from "@/lib/utils";
import type { EventKind, EventLevel } from "@/lib/types";

export const LEVEL_TONE: Record<EventLevel, string> = {
  info: "var(--ink-subtle)",
  success: "var(--ok)",
  warn: "var(--warn)",
  error: "var(--danger)",
};

export const KIND_TONE: Record<EventKind, string> = {
  task: "var(--brand)",
  a2a: "var(--brand-2)",
  gateway: "var(--brand-3)",
  vault: "var(--ok)",
  error: "var(--danger)",
  deploy: "var(--warn)",
  llm: "var(--ink-muted)",
  security: "var(--danger)",
};

const LEVEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

export function EventRow({
  event,
  onPickAgent,
}: {
  event: import("@/lib/types").ActivityEvent;
  onPickAgent?: (id: string) => void;
}) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
      className="group relative flex gap-3 rounded-2xl px-3 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-surface-2/70 hover:-translate-y-px"
    >
      <span
        className="mt-1.5 size-1.5 shrink-0 rounded-full"
        style={{ background: LEVEL_TONE[event.level] }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="truncate text-[13px] font-medium text-ink">{event.title}</span>
          <span className="font-mono text-[10px] text-ink-subtle">
            {formatRelative(event.ts)}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-subtle">
          {event.detail}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral" size="sm" className="font-mono">
            {event.agent}
          </Badge>
          <Badge
            size="sm"
            className="border-transparent"
            style={{ color: KIND_TONE[event.kind], background: "transparent" }}
          >
            {event.kind}
          </Badge>
          {typeof event.durationMs === "number" ? (
            <span className="font-mono text-[10px] text-ink-subtle">
              {formatMs(event.durationMs)}
            </span>
          ) : null}
          {typeof event.tokens === "number" ? (
            <span className="font-mono text-[10px] text-ink-subtle">
              {formatCompact(event.tokens)} tok
            </span>
          ) : null}
        </div>
      </div>
      {onPickAgent ? (
        <button
          type="button"
          onClick={() => onPickAgent(event.agent)}
          className="absolute right-2 top-2 rounded-lg px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ink-subtle opacity-0 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
        >
          inspect
        </button>
      ) : null}
    </motion.li>
  );
}

export function LiveFeed({
  limit = 12,
  showControls = true,
  className,
}: {
  limit?: number;
  showControls?: boolean;
  className?: string;
}) {
  const { live, setLive } = useConsole();
  const { setFocusAgent } = useConsole();
  const [level, setLevel] = useState("all");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const debounced = useDebouncedValue(query, 200);
  const { data, isLoading, mutate } = useActivity({ level, q: debounced });

  // Unpaused = newest `limit`. Paused ("Show all") = the full returned set, so
  // the control actually reveals more. The previous ternary returned `limit`
  // on both branches, making the toggle a no-op.
  const events = useMemo(
    () => (paused ? (data?.events ?? []) : (data?.events ?? []).slice(0, limit)),
    [data, limit, paused],
  );

  return (
    <SectionCard
      title="Recorded activity"
      description="Task transitions and agent exchanges as they were recorded, newest first. Nothing here is generated."
      className={className}
      bodyClassName="px-2 sm:px-2"
      actions={
        showControls ? (
          <div className="flex flex-wrap items-center gap-2">
            {showControls && level !== "all" ? (
              <Button variant="ghost" size="iconXs" onClick={() => setLevel("all")}>
                <FunnelSimpleIcon size={13} />
              </Button>
            ) : null}
            <Button
              variant={live ? "subtle" : "glass"}
              size="iconSm"
              onClick={() => setLive(!live)}
              aria-label={live ? "Hold stream" : "Resume stream"}
            >
              {live ? <PauseIcon size={14} weight="fill" /> : <PlayIcon size={14} weight="fill" />}
            </Button>
            <Button
              variant="glass"
              size="iconSm"
              onClick={() => void mutate()}
              aria-label="Reload events"
            >
              <ArrowClockwiseIcon size={14} className={isLoading ? "animate-spin" : undefined} />
            </Button>
          </div>
        ) : null
      }
    >
      {showControls ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 px-3">
          <SegmentedControl options={LEVEL_OPTIONS} value={level} onChange={setLevel} size="xs" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter events…"
            className="h-8 max-w-52 text-[12px]"
          />
        </div>
      ) : null}

      {isLoading && !data ? (
        <div className="space-y-2 px-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-2xl bg-surface-2/70" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="grid place-items-center gap-2 px-6 py-12 text-center">
          <PulseIcon size={20} className="text-ink-subtle" />
          {/* Two different empties. Telling someone to widen the filter when the
              log has never held an entry sends them off to fix a filter that
              was never the problem. */}
          <p className="text-[13px] font-medium">
            {data?.total ? "No events match" : "Nothing recorded yet"}
          </p>
          <p className="max-w-sm text-[12px] text-ink-subtle">
            {data?.total
              ? "Widen the level filter or clear the search box."
              : "This log fills as tasks move through review and questions reach an agent. It holds records, not a generated sample."}
          </p>
        </div>
      ) : (
        <ul className="max-h-[26rem] space-y-0.5 overflow-y-auto pr-1">
          <AnimatePresence initial={false} mode="popLayout">
            {events.map((event) => (
              <EventRow key={event.id} event={event} onPickAgent={setFocusAgent} />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline px-3 pt-3">
        <span className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
          <BroadcastIcon size={12} />
          {data ? `${data.total} buffered` : "connecting"}
        </span>
        <Button variant="link" size="xs" onClick={() => setPaused(!paused)}>
          {paused ? `Show latest ${limit}` : "Show all"}
        </Button>
      </div>
    </SectionCard>
  );
}

export function LevelDot({ level }: { level: EventLevel }) {
  return <Dot tone={LEVEL_TONE[level]} />;
}

export function KindChip({ kind, className }: { kind: EventKind; className?: string }) {
  return (
    <span
      className={cn("font-mono text-[10px] uppercase tracking-[0.12em]", className)}
      style={{ color: KIND_TONE[kind] }}
    >
      {kind}
    </span>
  );
}
