"use client";

import { motion } from "motion/react";
import {
  ArrowClockwiseIcon,
  ChartLineUpIcon,
  ShieldCheckIcon,
  StackIcon,
  CubeIcon,
  TerminalIcon,
} from "@phosphor-icons/react";
import { Card, Eyebrow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMesh } from "@/lib/hooks/use-data";
import { useConsole } from "@/components/providers/console-provider";
import { useMounted } from "@/lib/hooks/use-ui";
import {
  formatCompact,
  formatMs,
  formatNumber,
  formatPercent,
  formatRelative,
  NOT_MEASURED,
} from "@/lib/format";
import { MeshGraph, MeshLegend, AgentStrip } from "@/components/dashboard/mesh-graph";
import { StatCard } from "@/components/dashboard/stat-card";
import { LiveFeed } from "@/components/dashboard/live-feed";
import { LoadHeatmap } from "@/components/dashboard/load-heatmap";
import { ThroughputChart } from "@/components/dashboard/throughput-chart";
import { PageHeader } from "@/components/dashboard/page-header";
import { BRAND } from "@/lib/brand";
import { useRouter } from "next/navigation";

export default function OverviewPage() {
  const { data, isLoading, mutate } = useMesh();
  const { live, setFocusAgent, setPaletteOpen } = useConsole();
  const mounted = useMounted();
  const router = useRouter();

  if (isLoading || !data) {
    return <OverviewSkeleton />;
  }

  const { agents, totals, series, hierarchy } = data;
  const hasSeries = series.throughput.length > 0;
  const throughputNow = hasSeries ? (series.throughput.at(-1) ?? 0) : 0;
  const throughputPrev = hasSeries ? (series.throughput.at(-4) ?? throughputNow) : 0;
  const throughputDelta =
    throughputPrev === 0 ? 0 : ((throughputNow - throughputPrev) / throughputPrev) * 100;
  const unhealthy = totals.degraded + totals.offline;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command"
        title="Mesh overview"
        description={`${BRAND.expansion} · snapshot ${formatRelative(data.generatedAt)} · ${data.source === "live" ? "live gateways" : "simulated feed"}`}
        actions={
          <>
            <Button variant="glass" size="sm" onClick={() => setPaletteOpen(true)}>
              <TerminalIcon size={15} />
              Command
              <kbd className="ml-1 rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                void mutate();
              }}
            >
              <ArrowClockwiseIcon size={15} className={isLoading ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Peers online"
          value={totals.online}
          suffix={`/${agents.length}`}
          tone="var(--ok)"
          icon={<ShieldCheckIcon size={17} weight="duotone" />}
          hint={unhealthy > 0 ? `${unhealthy} need attention` : "all peers healthy"}
          onClick={() => router.push("/agents")}
        />
        <StatCard
          label="Throughput"
          value={hasSeries ? throughputNow : NOT_MEASURED}
          decimals={1}
          suffix={hasSeries ? " rps" : undefined}
          data={hasSeries ? series.throughput : undefined}
          tone="var(--brand)"
          delta={hasSeries ? throughputDelta : undefined}
          icon={<ChartLineUpIcon size={17} weight="duotone" />}
          hint={hasSeries ? `p95 ${formatMs(totals.p95Latency)}` : "no history exported by the host"}
          onClick={() => router.push("/analytics")}
        />
        <StatCard
          label="Open tasks"
          value={totals.tasks ?? NOT_MEASURED}
          tone="var(--brand-2)"
          icon={<CubeIcon size={17} weight="duotone" />}
          hint={
            totals.busy == null ? "queue depth not reported by the collector" : `${totals.busy} agents busy`
          }
          onClick={() => router.push("/kanban")}
        />
        <StatCard
          label="Token spend"
          value={totals.tokens ?? NOT_MEASURED}
          tone="var(--brand-3)"
          icon={<StackIcon size={17} weight="duotone" />}
          hint={
            totals.successRate == null
              ? "no request tally on the host"
              : `${formatPercent(totals.successRate)} success rate`
          }
          onClick={() => router.push("/analytics")}
        />
      </section>

      <section className="grid grid-cols-1 gap-4">
        <ThroughputChart series={series} accent="var(--brand)" height={188} title="Mesh throughput" />

        <Card tone="plate" className="relative overflow-hidden p-5 sm:p-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <Eyebrow>Topology</Eyebrow>
              <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">Reporting hierarchy</h2>
            </div>
            <MeshLegend agents={agents} links={hierarchy} />
          </div>

          <MeshGraph agents={agents} links={hierarchy} className="-mx-2 -mb-2" />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
            <AgentStrip agents={agents} onPick={setFocusAgent} />
            <div className="flex items-center gap-2 text-[11px] text-ink-subtle">
              <span
                className="size-1.5 rounded-full"
                style={{ background: live ? "var(--ok)" : "var(--ink-subtle)" }}
              />
              {live ? "streaming" : "held"}
            </div>
          </div>
        </Card>
      </section>

      <LoadHeatmap cells={data.heat} agents={agents.map((agent) => agent.id)} />

      <section className="grid grid-cols-1 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <LiveFeed limit={9} />
        <Card tone="plate" className="flex flex-col p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <Eyebrow>Quick actions</Eyebrow>
              <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em]">Shortcuts</h2>
            </div>
            <Badge tone="neutral">⌘K</Badge>
          </div>

          <div className="grid grid-cols-1 grid gap-2 sm:grid-cols-2">
            {agents.slice(0, 4).map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setFocusAgent(agent.id)}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface-2/50 px-3.5 py-3 text-left transition-all duration-500 hover:-translate-y-0.5 hover:border-hairline-strong hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{agent.id}</span>
                  <span className="block truncate text-[11px] text-ink-subtle">{agent.role}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-subtle">
                  {agent.queue == null ? "—" : `${formatNumber(agent.queue)} q`}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button variant="subtle" size="sm" onClick={() => router.push("/kanban?new=1")}>
              <CubeIcon size={15} />
              New task
            </Button>
            <Button variant="subtle" size="sm" onClick={() => router.push("/notes")}>
              <StackIcon size={15} />
              Open vault
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-hairline pt-4">
            <MiniStat label="avg hop" value={formatMs(totals.avgLatency)} />
            <MiniStat label="p95" value={formatMs(totals.p95Latency)} />
            <MiniStat label="links" value={formatNumber(totals.meshLinks)} />
          </div>

          {mounted && unhealthy > 0 ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-warn/25 bg-warn/8 p-3.5 text-[12px] text-warn">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-warn" />
              <span>
                {unhealthy} peer{unhealthy > 1 ? "s are" : " is"} degraded. Open Agents to reroute
                traffic or restart the gateway.
              </span>
            </div>
          ) : null}
        </Card>
      </section>

      <section className="grid grid-cols-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {agents.map((agent, index) => (
          <motion.button
            key={agent.id}
            type="button"
            onClick={() => setFocusAgent(agent.id)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.04, ease: [0.32, 0.72, 0, 1] }}
            className="plate group flex items-center gap-3 rounded-[1.5rem] p-3.5 text-left transition-all duration-700 hover:-translate-y-0.5 hover:shadow-lift"
          >
            <span
              className="size-9 shrink-0 rounded-xl"
              style={{ background: `linear-gradient(140deg, ${agent.accent}, transparent)` }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{agent.id}</span>
              <span className="block truncate text-[11px] text-ink-subtle">
                {agent.status} · {formatMs(agent.latencyMs)}
              </span>
            </span>
            <span className="font-mono text-[11px] text-ink-subtle">
              {formatCompact(agent.tokens)}
            </span>
          </motion.button>
        ))}
      </section>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {label}
      </p>
      <p className="mt-1 font-mono text-[14px] text-ink">{value}</p>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-16 w-full animate-pulse rounded-[1.5rem] bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-[1.5rem] bg-surface-2" />
        ))}
      </div>
      <div className="grid grid-cols-1 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="h-[30rem] animate-pulse rounded-[1.75rem] bg-surface-2" />
        <div className="h-[30rem] animate-pulse rounded-[1.75rem] bg-surface-2" />
      </div>
    </div>
  );
}
