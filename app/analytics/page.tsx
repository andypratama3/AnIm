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
import { formatCompact, formatMs, formatNumber, formatPercent } from "@/lib/format";
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
import { toast } from "sonner";

type Metric = "health" | "latency" | "load" | "tokens" | "queue";

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
      .sort((a, b) => b[metric] - a[metric]);
  }, [data, metric]);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-20 animate-pulse rounded-[1.5rem] bg-surface-2" />
        <div className="grid grid-cols-1 grid gap-4 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-[1.75rem] bg-surface-2" />
          <div className="h-72 animate-pulse rounded-[1.75rem] bg-surface-2" />
        </div>
      </div>
    );
  }

  const { series, totals, agents } = data;
  const avgThroughput = series.throughput.reduce((sum, value) => sum + value, 0) / series.throughput.length;
  const peakLatency = Math.max(...series.latency);
  const totalErrors = series.errors.reduce((sum, value) => sum + value, 0);
  const windowMinutes = Math.round(series.labels.length * 0.5);

  const exportCsv = () => {
    const header = "agent,status,health,latency_ms,load,tokens,queue,uptime\n";
    const body = rows
      .map((row) =>
        [row.id, row.status, row.health.toFixed(1), Math.round(row.latency), Math.round(row.load), row.tokens, row.queue, row.uptime.toFixed(2)].join(","),
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
        description={`Rolling ${windowMinutes}-minute window sampled every 30 seconds across all seven peers.`}
        meta={
          <>
            <Badge tone={data.source === "live" ? "ok" : "neutral"}>
              {data.source === "live" ? "live gateways" : "simulated"}
            </Badge>
            <Badge tone="neutral">{interval / 1000}s refresh</Badge>
            <Badge tone={totals.successRate >= 98 ? "ok" : "warn"}>
              {formatPercent(totals.successRate)} success
            </Badge>
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
          value={avgThroughput}
          decimals={2}
          suffix=" rps"
          tone="var(--brand)"
          data={series.throughput}
          icon={<ChartLineUpIcon size={17} weight="duotone" />}
          hint={`peak ${formatNumber(Math.max(...series.throughput))} rps`}
        />
        <StatCard
          label="p95 latency"
          value={totals.p95Latency}
          suffix=" ms"
          tone="var(--brand-2)"
          data={series.latency}
          icon={<ClockIcon size={17} weight="duotone" />}
          hint={`peak ${Math.round(peakLatency)} ms in window`}
        />
        <StatCard
          label="Token burn"
          value={totals.tokens}
          tone="var(--brand-3)"
          data={series.tokens}
          icon={<CpuIcon size={17} weight="duotone" />}
          hint={`${formatCompact(totals.tokens / Math.max(1, windowMinutes))} per minute`}
        />
        <StatCard
          label="Errors"
          value={totalErrors}
          tone={totalErrors > 0 ? "var(--danger)" : "var(--ok)"}
          data={series.errors}
          icon={<LightningIcon size={17} weight="duotone" />}
          hint={totalErrors === 0 ? "clean window" : "inspect the activity log"}
        />
      </section>

      <section className="grid grid-cols-1 grid gap-4 lg:grid-cols-2">
        <ThroughputChart series={series} height={230} title="Throughput trend" />
        <LatencyChart series={series} height={230} />
        <TokenSpendChart series={series} height={210} />
        <ErrorsChart series={series} height={210} />
      </section>

      <section className="grid grid-cols-1 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
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
                  <TR key={row.id} onClick={() => router.push("/agents")}>
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
                      <span className="font-mono text-[12px]">{Math.round(row.health)}</span>
                    </TD>
                    <TD>
                      <span className="font-mono text-[12px]">{formatMs(row.latency)}</span>
                    </TD>
                    <TD>
                      <span className="font-mono text-[12px]">{Math.round(row.load)}%</span>
                    </TD>
                    <TD>
                      <Sparkline
                        data={[row.throughput, row.throughput * 0.8, row.throughput * 1.1, row.throughput]}
                        tone={STATUS_COLOR[row.status]}
                        height={22}
                        showDot={false}
                        className="w-20"
                      />
                    </TD>
                    <TD>
                      <span className="font-mono text-[12px]">{formatCompact(row.tokens)}</span>
                    </TD>
                    <TD>
                      <span className="font-mono text-[12px] text-ink-muted">
                        {row.uptime.toFixed(2)}%
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Mesh composition" description="Where the health score comes from.">
            <div className="flex items-center justify-around gap-3">
              <RadialGauge value={totals.successRate} size={116} label="success %" />
              <div className="space-y-2 text-[12px]">
                <Line label="online" value={`${totals.online}/${agents.length}`} tone="var(--ok)" />
                <Line label="busy" value={String(totals.busy)} tone="var(--brand)" />
                <Line label="degraded" value={String(totals.degraded)} tone="var(--warn)" />
                <Line label="offline" value={String(totals.offline)} tone="var(--danger)" />
                <Line label="links" value={String(totals.meshLinks)} tone="var(--brand-3)" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-3 text-[11px] text-ink-subtle">
              <ShieldCheckIcon size={13} />
              All peers share <span className="font-mono text-ink">thinkingmachines/inkling:free</span>
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
