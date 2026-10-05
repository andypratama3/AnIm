"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowClockwiseIcon,
  BroadcastIcon,
  SlidersHorizontalIcon,
  MagnifyingGlassIcon,
  ArrowsDownUpIcon,
} from "@phosphor-icons/react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useMesh } from "@/lib/hooks/use-data";
import { useConsole } from "@/components/providers/console-provider";
import { useDebouncedValue } from "@/lib/hooks/use-ui";
import { formatCompact, formatMs, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { PageHeader, SectionCard, SegmentedControl, EmptyState } from "@/components/dashboard/page-header";
import { AgentStrip } from "@/components/dashboard/mesh-graph";
import { LiveConstellationPanel } from "@/components/dashboard/live-constellation";
import { HeatmapInline } from "@/components/dashboard/load-heatmap";
import { Sparkline, RadialGauge } from "@/components/dashboard/sparkline";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge, Dot, Meter } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/menus";
import { AgentGlyph, STATUS_COLOR } from "@/components/dashboard/agent-glyph";
import { cn } from "@/lib/utils";
import type { Agent, AgentStatus } from "@/lib/types";

const column = createColumnHelper<Agent>();

const STATUS_OPTIONS: ReadonlyArray<{ value: AgentStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "online", label: "Online" },
  { value: "busy", label: "Busy" },
  { value: "degraded", label: "Degraded" },
  { value: "offline", label: "Offline" },
];

const SORT_OPTIONS = [
  { value: "health", label: "Health" },
  { value: "latency", label: "Latency" },
  { value: "load", label: "Load" },
  { value: "tokens", label: "Tokens" },
  { value: "name", label: "Name" },
] as const;

export default function AgentsPage() {
  const { data, isLoading, mutate } = useMesh();
  const { setFocusAgent, focusAgent, live } = useConsole();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AgentStatus | "all">("all");
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["value"]>("health");
  const [sorting, setSorting] = useState<SortingState>([{ id: "health", desc: true }]);
  const debounced = useDebouncedValue(query, 200);

  const agents = useMemo(() => data?.agents ?? [], [data]);

  const filtered = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    return agents.filter((agent) => {
      if (status !== "all" && agent.status !== status) return false;
      if (!needle) return true;
      return [agent.id, agent.role, agent.model, agent.provider, String(agent.port)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [agents, debounced, status]);

  // TanStack Table is not React-Compiler compatible yet, so the compiler skips
  // this component. The table is a leaf view with no effects of its own, so the
  // skipped optimisation is safe here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filtered,
    columns: [
      column.accessor("id", { header: "Peer", cell: (info) => <PeerCell agent={info.row.original} /> }),
      column.accessor("status", {
        header: "Status",
        cell: (info) => <StatusCell status={info.getValue()} />,
      }),
      column.accessor("health", {
        header: "Health",
        cell: (info) => <HealthCell value={info.getValue()} />,
      }),
      column.accessor("latencyMs", {
        header: "Latency",
        cell: (info) => <span className="font-mono text-[12px]">{formatMs(info.getValue())}</span>,
      }),
      column.accessor("load", {
        header: "Load",
        cell: (info) => <LoadCell value={info.getValue()} />,
      }),
      column.accessor("throughput", {
        header: "Throughput",
        enableSorting: false,
        cell: (info) => (
          <Sparkline
            data={info.getValue()}
            tone={STATUS_COLOR[info.row.original.status]}
            height={26}
            showDot={false}
            className="w-24"
          />
        ),
      }),
      column.accessor("queue", {
        header: "Queue",
        cell: (info) => <span className="font-mono text-[12px]">{formatNumber(info.getValue())}</span>,
      }),
      column.accessor("tokens", {
        header: "Tokens",
        cell: (info) => (
          <span className="font-mono text-[12px]">{formatCompact(info.getValue())}</span>
        ),
      }),
      column.accessor("uptimePct", {
        header: "Uptime",
        cell: (info) => (
          <span className="font-mono text-[12px] text-ink-muted">
            {formatPercent(info.getValue(), 2)}
          </span>
        ),
      }),
      column.accessor("lastSeen", {
        header: "Seen",
        cell: (info) => (
          <span className="font-mono text-[11px] text-ink-subtle">
            {formatRelative(info.getValue(), data?.generatedAt)}
          </span>
        ),
      }),
    ],
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: agents.length };
    for (const option of STATUS_OPTIONS) {
      if (option.value === "all") continue;
      base[option.value] = agents.filter((agent) => agent.status === option.value).length;
    }
    return base;
  }, [agents]);

  const applySort = (value: (typeof SORT_OPTIONS)[number]["value"]) => {
    setSort(value);
    if (value === "name") {
      setSorting([{ id: "id", desc: false }]);
      return;
    }
    setSorting([{ id: value, desc: value !== "latency" }]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command"
        title="Agents"
        description={`Every profile on the mesh, pinned to a gateway port with its own MCP toolset. ${
          data?.source === "live"
            ? "Roster, ports, peer counts and gateway state are read from the host; metrics the collector does not report render as an em dash."
            : "The host bridge is unreachable, so this roster is the simulated planning view and is labelled as such."
        }`}
        meta={
          <>
            <Badge tone="ok">
              <Dot tone="var(--ok)" pulse={live} />
              {counts.online ?? 0} online
            </Badge>
            <Badge tone="brand">{counts.busy ?? 0} busy</Badge>
            {(counts.degraded ?? 0) + (counts.offline ?? 0) > 0 ? (
              <Badge tone="warn">{(counts.degraded ?? 0) + (counts.offline ?? 0)} unhealthy</Badge>
            ) : null}
            <Badge tone="neutral">{data?.totals.meshLinks ?? 0} A2A links</Badge>
          </>
        }
        actions={
          <>
            <Button variant="glass" size="sm" onClick={() => router.push("/activity")}>
              <BroadcastIcon size={15} />
              Stream
            </Button>
            <Button variant="primary" size="sm" onClick={() => void mutate()}>
              <ArrowClockwiseIcon size={15} className={isLoading ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </>
        }
      />

      <LiveConstellationPanel />

      <SectionCard
        title="Peer roster"
        description="Click any row to open the inspector. Sort by the column you care about."
        bodyClassName="px-0 sm:px-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <MagnifyingGlassIcon
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search peers…"
                className="h-8 w-44 pl-8 text-[12px]"
              />
            </div>
            <SegmentedControl
              size="xs"
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS.map((option) => ({
                ...option,
                count: counts[option.value] ?? 0,
              }))}
            />
            <Select value={sort} onValueChange={(value) => applySort(value as typeof sort)}>
              <SelectTrigger className="h-8 w-36 text-[12px]">
                <ArrowsDownUpIcon size={13} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {filtered.length === 0 ? (
          <div className="px-5 pb-6">
            <EmptyState
              icon={<SlidersHorizontalIcon size={22} />}
              title="No peers match"
              description={`Reset the status filter or clear the search to see all ${agents.length} profiles.`}
              action={
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setStatus("all");
                    setQuery("");
                  }}
                >
                  Reset filters
                </Button>
              }
            />
          </div>
        ) : (
          <TableWrap>
            <Table>
              <THead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TR key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TH key={header.id}>
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 transition-colors hover:text-ink"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{ asc: "↑", desc: "↓" }[
                              header.column.getIsSorted() as string
                            ] ?? null}
                          </button>
                        )}
                      </TH>
                    ))}
                  </TR>
                ))}
              </THead>
              <TBody>
                {table.getRowModel().rows.map((row) => (
                  <TR
                    key={row.id}
                    onClick={() => setFocusAgent(row.original.id)}
                    className={cn(
                      "cursor-pointer",
                      focusAgent === row.original.id && "bg-brand/6",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TD key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </SectionCard>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Health distribution" description="Composite score per peer.">
          <div className="flex flex-wrap items-center justify-around gap-4">
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setFocusAgent(agent.id)}
                className="flex flex-col items-center gap-2 rounded-2xl p-2 transition-all duration-500 hover:scale-105 hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <RadialGauge
                  value={agent.health}
                  size={76}
                  tone={STATUS_COLOR[agent.status]}
                  label={undefined}
                />
                <span className="max-w-20 truncate font-mono text-[10px] text-ink-subtle">
                  {agent.id}
                </span>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="24h load profile" description="Hourly saturation per peer.">
          <div className="space-y-3">
            {agents.map((agent) => (
              <div key={agent.id} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate font-mono text-[11px] text-ink-subtle">
                  {agent.id}
                </span>
                <HeatmapInline cells={data?.heat ?? []} agent={agent.id} />
                <span className="w-9 shrink-0 text-right font-mono text-[11px] text-ink">
                  {formatPercent(agent.load, 0)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
            <AgentStrip agents={agents.slice(0, 4)} onPick={setFocusAgent} />
            <span className="text-[11px] text-ink-subtle">
              success {formatPercent(data?.totals.successRate)}
            </span>
          </div>
        </SectionCard>
      </section>
    </div>
  );
}

function PeerCell({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-center gap-2.5">
      <AgentGlyph id={agent.id} accent={agent.accent} size={26} status={agent.status} pulse={false} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{agent.id}</p>
        <p className="truncate font-mono text-[10px] text-ink-subtle">
          :{agent.port} · {agent.role}
        </p>
      </div>
    </div>
  );
}

function StatusCell({ status }: { status: AgentStatus }) {
  return (
    <Badge tone={status === "online" ? "ok" : status === "busy" ? "brand" : status === "degraded" ? "warn" : "danger"}>
      <Dot tone={STATUS_COLOR[status]} pulse={status !== "offline"} />
      {status}
    </Badge>
  );
}

function HealthCell({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 font-mono text-[12px] text-ink">{Math.round(value)}</span>
      <Meter value={value} tone="var(--ok)" className="w-16" height={4} />
    </div>
  );
}

function LoadCell({ value }: { value: number }) {
  const tone = value >= 85 ? "var(--danger)" : value >= 65 ? "var(--warn)" : "var(--brand)";
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 font-mono text-[12px]" style={{ color: tone }}>
        {Math.round(value)}%
      </span>
      <Meter value={value} tone={tone} className="w-16" height={4} />
    </div>
  );
}
