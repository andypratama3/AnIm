"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowClockwiseIcon,
  BroadcastIcon,
  FunnelSimpleIcon,
  PauseIcon,
  PlayIcon,
  ArrowSquareOutIcon,
} from "@phosphor-icons/react";
import { useActivity } from "@/lib/hooks/use-data";
import { useConsole } from "@/components/providers/console-provider";
import { useDebouncedValue } from "@/lib/hooks/use-ui";
import { formatMs, formatRelative, formatCompact } from "@/lib/format";
import { PageHeader, SectionCard, SegmentedControl, EmptyState } from "@/components/dashboard/page-header";
import { LEVEL_TONE, KIND_TONE } from "@/components/dashboard/live-feed";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, Dot } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/menus";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ActivityEvent, EventKind, EventLevel } from "@/lib/types";

const LEVELS: ReadonlyArray<{ value: EventLevel | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

const KINDS: ReadonlyArray<{ value: EventKind | "all"; label: string }> = [
  { value: "all", label: "All kinds" },
  { value: "task", label: "Task" },
  { value: "a2a", label: "A2A" },
  { value: "gateway", label: "Gateway" },
  { value: "vault", label: "Vault" },
  { value: "llm", label: "LLM" },
  { value: "deploy", label: "Deploy" },
  { value: "error", label: "Error" },
  { value: "security", label: "Security" },
];

function ActivityInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { live, setLive, setFocusAgent } = useConsole();
  const [level, setLevel] = useState<EventLevel | "all">(
    (params.get("level") as EventLevel) ?? "all",
  );
  const [kind, setKind] = useState<EventKind | "all">("all");
  const [agent, setAgent] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ActivityEvent | null>(null);
  const debounced = useDebouncedValue(query, 200);

  const { data, isLoading, mutate } = useActivity({ level, kind, agent, q: debounced });

  const events = useMemo(() => data?.events ?? [], [data]);
  const agents = useMemo(
    () => Array.from(new Set(events.map((event) => event.agent))).sort(),
    [events],
  );

  const levelCounts = useMemo(() => {
    const base: Record<string, number> = { all: events.length };
    for (const option of LEVELS) {
      if (option.value === "all") continue;
      base[option.value] = events.filter((event) => event.level === option.value).length;
    }
    return base;
  }, [events]);

  const setLevelFilter = (value: EventLevel | "all") => {
    setLevel(value);
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("level");
    else next.set("level", value);
    router.replace(`/activity?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command"
        title="Activity"
        description="Every task transition and agent exchange this console has recorded. Gateway restarts, deploys and vault writes are not logged anywhere yet, so they do not appear here."
        meta={
          <>
            {/* The toggle below pauses refetching; it does not make the log a
                stream. Labelling generated rows "streaming" was the claim this
                replaces. */}
            <Badge tone="neutral">
              <Dot tone="var(--ink-subtle)" pulse={live} />
              {live ? "refreshing" : "paused"}
            </Badge>
            <Badge tone="neutral">from task history + chat records</Badge>
            <Badge tone="neutral">{data?.total ?? 0} buffered</Badge>
            {levelCounts.error ? <Badge tone="danger">{levelCounts.error} errors</Badge> : null}
            {levelCounts.warn ? <Badge tone="warn">{levelCounts.warn} warnings</Badge> : null}
          </>
        }
        actions={
          <>
            <Button variant="glass" size="sm" onClick={() => setLive(!live)}>
              {live ? <PauseIcon size={15} weight="fill" /> : <PlayIcon size={15} weight="fill" />}
              {live ? "Hold" : "Resume"}
            </Button>
            <Button variant="primary" size="sm" onClick={() => void mutate()}>
              <ArrowClockwiseIcon size={15} className={isLoading ? "animate-spin" : undefined} />
              Replay
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-surface-2/50 p-2">
        <SegmentedControl
          size="xs"
          value={level}
          onChange={setLevelFilter}
          options={LEVELS.map((option) => ({ ...option, count: levelCounts[option.value] ?? 0 }))}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={(value) => setKind(value as EventKind | "all")}>
            <SelectTrigger className="h-8 w-36 text-[12px]">
              <FunnelSimpleIcon size={13} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agent} onValueChange={setAgent}>
            <SelectTrigger className="h-8 w-36 text-[12px]">
              <BroadcastIcon size={13} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All peers</SelectItem>
              {agents.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search log…"
            className="h-8 w-44 text-[12px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SectionCard
          title="Event log"
          description="Newest first. Select a row for full context."
          padding="none"
          actions={
            selected ? (
              <Button variant="ghost" size="xs" onClick={() => setSelected(null)}>
                clear selection
              </Button>
            ) : null
          }
        >
          {isLoading && !data ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-xl bg-surface-2/70" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nothing logged yet"
                description="No events match this combination of level, kind and peer. Loosen the filters to see the full stream."
                action={
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => {
                      setLevel("all");
                      setKind("all");
                      setAgent("all");
                      setQuery("");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="max-h-[42rem] divide-y divide-hairline overflow-y-auto">
              {events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(event)}
                    className={cn(
                      "flex w-full items-start gap-3 px-5 py-3 text-left transition-colors duration-300 hover:bg-surface-2/60",
                      selected?.id === event.id && "bg-brand/6",
                    )}
                  >
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full"
                      style={{ background: LEVEL_TONE[event.level] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="truncate text-[13px] font-medium text-ink">
                          {event.title}
                        </span>
                        <span className="font-mono text-[10px] text-ink-subtle">
                          {formatRelative(event.ts, data?.generatedAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-ink-subtle">
                        {event.detail}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]"
                        style={{
                          color: KIND_TONE[event.kind],
                          background: `color-mix(in oklab, ${KIND_TONE[event.kind]} 12%, transparent)`,
                        }}
                      >
                        {event.kind}
                      </span>
                      <span className="hidden font-mono text-[11px] text-ink-subtle sm:inline">
                        {event.agent}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Event detail" description="Full payload for the selected record.">
            {selected ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Dot tone={LEVEL_TONE[selected.level]} pulse />
                    <span className="text-[14px] font-medium">{selected.title}</span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                    {selected.detail}
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-[12px]">
                  <Detail label="peer" value={selected.agent} mono />
                  <Detail label="kind" value={selected.kind} />
                  <Detail label="level" value={selected.level} />
                  <Detail label="timestamp" value={formatRelative(selected.ts, data?.generatedAt)} />
                  {typeof selected.durationMs === "number" ? (
                    <Detail label="duration" value={formatMs(selected.durationMs)} mono />
                  ) : null}
                  {typeof selected.tokens === "number" ? (
                    <Detail label="tokens" value={formatCompact(selected.tokens)} mono />
                  ) : null}
                </dl>

                <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
                  <Button variant="subtle" size="sm" onClick={() => setFocusAgent(selected.agent)}>
                    Open peer
                  </Button>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        JSON.stringify(selected, null, 2),
                      );
                      toast.success("Event JSON copied");
                    }}
                  >
                    Copy JSON
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No event selected"
                description="Pick a row from the log to inspect its timing, token cost and originating peer."
              />
            )}
          </SectionCard>

          <SectionCard title="Level mix" description="Distribution in the current window.">
            <div className="space-y-2.5">
              {LEVELS.filter((option) => option.value !== "all").map((option) => {
                const value = levelCounts[option.value] ?? 0;
                const pct = events.length === 0 ? 0 : (value / events.length) * 100;
                return (
                  <div key={option.value} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-[11px] text-ink-muted">{option.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full transition-[width] duration-700"
                        style={{
                          width: `${pct}%`,
                          background: LEVEL_TONE[option.value as EventLevel],
                        }}
                      />
                    </div>
                    <span className="w-7 shrink-0 text-right font-mono text-[11px] text-ink">
                      {value}
                    </span>
                  </div>
                );
              })}
            </div>
            <Button
              variant="link"
              size="xs"
              className="mt-4"
              onClick={() => router.push("/analytics")}
            >
              Open analytics
              <ArrowSquareOutIcon size={12} />
            </Button>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {label}
      </dt>
      <dd className={cn("mt-0.5 text-ink", mono && "font-mono text-[11.5px]")}>{value}</dd>
    </div>
  );
}

export default function ActivityPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[60vh] animate-pulse rounded-[1.75rem] bg-surface-2" />
      }
    >
      <ActivityInner />
    </Suspense>
  );
}
