"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowClockwiseIcon,
  ChartLineUpIcon,
  DownloadSimpleIcon,
  CpuIcon,
  LightningIcon,
  ShieldCheckIcon,
  ClockIcon,
} from "@phosphor-icons/react";
import { useMesh } from "@/lib/hooks/use-data";
import { useConsole } from "@/components/providers/console-provider";
import { useCopyToClipboard } from "@/lib/hooks/use-ui";
import {
  formatCompact,
  formatMs,
  formatNumber,
  formatPercent,
  NOT_MEASURED,
} from "@/lib/format";
import { PageHeader, SectionCard, SegmentedControl } from "@/components/dashboard/page-header";
import {
  ThroughputChart,
  LatencyChart,
  ErrorsChart,
  TokenSpendChart,
} from "@/components/dashboard/throughput-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { Sparkline, RadialGauge } from "@/components/dashboard/sparkline";
import { LiveFeed } from "@/components/dashboard/live-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { STATUS_COLOR } from "@/components/dashboard/agent-glyph";
import { MODEL_DEFAULT } from "@/lib/data/profiles";
import { toast } from "sonner";

type Metric = "health" | "latency" | "load" | "tokens" | "queue";

/** Renders a fractional window without pretending it is a whole number. */
function formatWindow(minutes: number): string {
  return minutes >= 1 ? minutes.toFixed(0) : minutes.toFixed(1);
}

export default function AnalyticsPage() {
  const { data, isLoading, mutate } = useMesh();
  const { interval } = useConsole();
  const router = useRouter();
  const [metric, setMetric] = useState<Metric>("latency");
  const [copied, copy] = useCopyToClipboard();

  const rows = useMemo(() => {
    if (!data) return [];
    return [...data.agents]
      .map((agent) => ({
        id: agent.id,
        status: agent.status,
        health: agent.health,
        latency: agent.latencyMs,
        load: agent.load,
        tokens: agent.tokens,
        queue: agent.queue,
        uptime: agent.uptimePct,
        throughput: agent.throughput.at(-1) ?? 0,
        accent: agent.accent,
      }))
      // Unmeasured metrics sort last instead of pretending to be 0, which
      // would pin every offline agent to the top of a "lowest" ranking.
      .sort((a, b) => (b[metric] ?? -Infinity) - (a[metric] ?? -Infinity));
  }, [data, metric]);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-20 animate-pulse rounded-[1.5rem] bg-surface-2" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-[1.75rem] bg-surface-2" />
          <div className="h-72 animate-pulse rounded-[1.75rem] bg-surface-2" />
        </div>
      </div>
    );
  }

  const { series, totals, agents } = data;
  const hasSeries = series.throughput.length > 0;
  const avgThroughput = hasSeries
    ? series.throughput.reduce((sum, value) => sum + value, 0) / series.throughput.length
    : null;
  const peakLatency = hasSeries ? Math.max(...series.latency) : null;
  const totalErrors = hasSeries ? series.errors.reduce((sum, value) => sum + value, 0) : null;
  // The window comes from the real bucket width, not an assumed 30s interval.
  const windowMinutes = (series.labels.length * series.resolutionSec) / 60;
  // The engine reports mean requests/second per bucket. Summing those buckets
  // would produce a number with no unit, so a rate is averaged instead.
  const synthetic = series.synthetic;

  const exportCsv = () => {
    const header = "agent,status,health,latency_ms,load,tokens,queue,uptime\n";
    // An unmeasured cell exports as an empty field, not as a 0 that a
    // spreadsheet would happily total up.
    const cell = (value: number | null) => (value == null ? "" : String(Math.round(value * 100) / 100));
    const body = rows
      .map((row) =>
        [
          row.id,
          row.status,
          row.health == null ? NOT_MEASURED : row.health.toFixed(1),
          cell(row.latency),
          cell(row.load),
          cell(row.tokens),
          cell(row.queue),
          cell(row.uptime),
        ].join(","),
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anim-mesh-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported", { description: `${rows.length} peers · ${interval / 1000}s cadence` });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow"
        title="Analytics"
        description={
          hasSeries
            ? `Rolling ${formatWindow(windowMinutes)}-minute window, ${series.resolutionSec}s buckets across all ${agents.length} peers, recorded by this console while it is open.${synthetic ? " Series is generated locally." : ""}`
            : "No history exported by the host — the collector reports a point-in-time snapshot only, Collecting the first samples — charts fill in as the console polls."
        }
        meta={
          <>
            <Badge tone={data.source === "live" ? "ok" : "neutral"}>
              {data.source === "live" ? "live gateways" : "simulated"}
            </Badge>
            <Badge tone="neutral">{interval / 1000}s refresh</Badge>
            {totals.successRate == null ? (
              <Badge tone="neutral">success not reported</Badge>
            ) : (
              <Badge tone={totals.successRate >= 98 ? "ok" : "warn"}>
                {formatPercent(totals.successRate)} success
              </Badge>
            )}
          </>
        }
        actions={
          <>
            <Button
              variant="glass"
              size="sm"
              onClick={async () => {
                await copy(JSON.stringify({ totals, series }, null, 2));
                toast.success("Snapshot JSON copied");
              }}
            >
              {copied ? "copied" : "Copy JSON"}
            </Button>
            <Button variant="subtle" size="sm" onClick={exportCsv}>
              <DownloadSimpleIcon size={15} />
              Export CSV
            </Button>
            <Button variant="primary" size="sm" onClick={() => void mutate()}>
              <ArrowClockwiseIcon size={15} className={isLoading ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Mean throughput"
          value={avgThroughput ?? NOT_MEASURED}
          decimals={2}
          suffix={avgThroughput == null ? undefined : " rps"}
          data={hasSeries ? series.throughput : undefined}
          tone="var(--brand)"
          icon={<ChartLineUpIcon size={17} weight="duotone" />}
          hint={hasSeries ? `peak ${formatNumber(Math.max(...series.throughput))} rps` : "no history exported by the host"}
          className="ring-1 ring-inset ring-hairline hover:ring-brand/30"
        />
        <StatCard
          label="p95 latency"
          value={totals.p95Latency ?? NOT_MEASURED}
          tone="var(--brand-2)"
          data={hasSeries ? series.latency : undefined}
          icon={<ClockIcon size={17} weight="duotone" />}
          hint={
            peakLatency == null
              ? "no history exported by the host"
              : `peak ${Math.round(peakLatency)} ms in window${
                  totals.collectMs == null ? "" : ` · sweep ${formatMs(totals.collectMs)}`
                }`
          }
          className="ring-1 ring-inset ring-hairline hover:ring-brand/30"
        />
        <StatCard
          label="Token burn"
          value={totals.tokens ?? NOT_MEASURED}
          tone="var(--brand-3)"
          data={hasSeries ? series.tokens : undefined}
          icon={<CpuIcon size={17} weight="duotone" />}
          hint={
            synthetic
              ? "generated locally, not measured"
              : totals.tokens == null
                ? "not reported by the collector"
                : `${formatCompact(totals.tokens / Math.max(1, windowMinutes))} per minute`
          }
          className="ring-1 ring-inset ring-hairline hover:ring-brand/30"
        />
        <StatCard
          label="Errors"
          value={totalErrors ?? NOT_MEASURED}
          tone={totalErrors == null || totalErrors === 0 ? "var(--ok)" : "var(--danger)"}
          data={hasSeries ? series.errors : undefined}
          icon={<LightningIcon size={17} weight="duotone" />}
          hint={totalErrors == null ? "no history exported by the host" : totalErrors === 0 ? "clean window" : "inspect the activity log"}
          className="ring-1 ring-inset ring-hairline hover:ring-brand/30"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ThroughputChart series={series} height={230} title="Throughput trend" />
        <LatencyChart series={series} height={230} />
        <TokenSpendChart series={series} height={210} />
        <ErrorsChart series={series} height={210} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <SectionCard
          title="Peer leaderboard"
          description="Sort by the metric that matters to you right now."
          padding="none"
          bodyClassName="px-0 sm:px-0"
          actions={
            <SegmentedControl
              size="xs"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "health", label: "Health" },
                { value: "latency", label: "Latency" },
                { value: "load", label: "Load" },
                { value: "tokens", label: "Tokens" },
                { value: "queue", label: "Queue" },
              ]}
            />
          }
        >
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Peer</TH>
                  <TH>Health</TH>
                  <TH>Latency</TH>
                  <TH>Load</TH>
                  <TH>Throughput</TH>
                  <TH>Tokens</TH>
                  <TH>Uptime</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row, index) => (
                  <TR key={row.id} onClick={() => router.push("/agents")} className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-[11px] text-ink-subtle">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span
                          className="size-2 rounded-full"
                          style={{ background: STATUS_COLOR[row.status] }}
                        />
                        <span className="text-[13px] font-medium">{row.id}</span>
                      </div>
                    </TD>
                    <TD>
                      <span className="font-mono text-[12px]">{row.health == null ? NOT_MEASURED : Math.round(row.health)}</span>
                    </TD>
                    <TD>
                      <span className="font-mono text-[12px]">{formatMs(row.latency)}</span>
                    </TD>
                    <TD>
                      <span className="font-mono text-[12px]">{formatPercent(row.load, 0)}</span>
                    </TD>
                    <TD>
                      {row.throughput > 0 ? (
                        <Sparkline
                          data={[row.throughput, row.throughput * 0.8, row.throughput * 1.1, row.throughput]}
                          tone={STATUS_COLOR[row.status]}
                          height={22}
                          showDot={false}
                          className="w-20"
                        />
                      ) : (
                        <span className="font-mono text-[12px] text-ink-subtle">—</span>
                      )}
                    </TD>
                    <TD>
                      <span className="font-mono text-[12px]">{formatCompact(row.tokens)}</span>
                    </TD>
                    <TD>
                      <span className="font-mono text-[12px] text-ink-muted">
                        {formatPercent(row.uptime, 2)}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard
            title="Mesh composition"
            description="Roster composition, and the share of peers the inventory round trip reached. That share is unmeasured on the live path."
          >
            <div className="flex items-center justify-around gap-3">
              <RadialGauge
                value={totals.successRate}
                size={116}
                label={totals.successRate == null ? "not reported" : "success %"}
              />
              <div className="space-y-2 text-[12px]">
                <Line label="online" value={`${totals.online}/${agents.length}`} tone="var(--ok)" />
                <Line
                  label="busy"
                  value={totals.busy == null ? NOT_MEASURED : String(totals.busy)}
                  tone="var(--brand)"
                />
                <Line label="degraded" value={String(totals.degraded)} tone="var(--warn)" />
                <Line label="offline" value={String(totals.offline)} tone="var(--danger)" />
                <Line label="links" value={String(totals.meshLinks)} tone="var(--brand-3)" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-3 text-[11px] text-ink-subtle">
              <ShieldCheckIcon size={13} />
              {data?.source === "live" ? (
                <span>The mesh does not report a resolved model per peer, so none is claimed here.</span>
              ) : (
                <span>
                  Simulated snapshot — peers shown here stand in for{" "}
                  <span className="font-mono text-ink">{MODEL_DEFAULT}</span> and do not reflect live traffic.
                </span>
              )}
            </div>
          </SectionCard>

          <LiveFeed limit={7} showControls={false} />
        </div>
      </section>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-1.5 rounded-full" style={{ background: tone }} />
      <span className="text-ink-subtle">{label}</span>
      <span className="ml-auto font-mono text-ink">{value}</span>
    </div>
  );
}
