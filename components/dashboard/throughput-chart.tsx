"use client";

import { useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/dashboard/page-header";
import { formatMs, formatCompact } from "@/lib/format";
import type { Series } from "@/lib/types";

const AXIS = {
  stroke: "var(--ink-subtle)",
  fontSize: 10,
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-hairline bg-surface/95 px-3 py-2 shadow-lift backdrop-blur-xl">
      <p className="font-mono text-[10px] text-ink-subtle">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((item) => (
          <p key={item.name} className="flex items-center gap-2 text-[12px] text-ink">
            <span className="size-1.5 rounded-full" style={{ background: item.color }} />
            <span className="text-ink-subtle">{item.name}</span>
            <span className="ml-auto font-mono">
              {item.value}
              {unit}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

type Range = "30" | "60" | "all";

type RangeOption = { value: Range; label: string };

/**
 * Offer only the windows the series can actually satisfy. With a 45s bucket and
 * 40 points the real span is 30 minutes, so "1h" would be a control that
 * silently renders the same data as "All". Better to omit it than to lie.
 */
function buildRangeOptions(series: Series): RangeOption[] {
  const spanMin = (series.labels.length * series.resolutionSec) / 60;
  const options: RangeOption[] = [];
  if (spanMin >= 15) options.push({ value: "30", label: "30m" });
  if (spanMin >= 60) options.push({ value: "60", label: "1h" });
  options.push({ value: "all", label: "All" });
  return options;
}

function sliceByWindow(
  series: Series,
  options: RangeOption[],
  range: Range,
): Array<{ label: string; throughput: number; latency: number; errors: number; tokens: number }> {
  const rows = series.labels.map((label, index) => ({
    label,
    throughput: series.throughput[index] ?? 0,
    latency: series.latency[index] ?? 0,
    errors: series.errors[index] ?? 0,
    tokens: series.tokens[index] ?? 0,
  }));

  if (range === "all") return rows;
  const minutes = Number(range);
  const keep = Math.max(1, Math.floor((minutes * 60) / series.resolutionSec));
  const available = options.find((option) => option.value === range);
  if (!available) return rows;
  return rows.slice(-keep);
}

export function ThroughputChart({
  series,
  accent = "var(--brand)",
  height = 200,
  title = "Throughput",
  className,
}: {
  series: Series;
  accent?: string;
  height?: number;
  title?: string;
  className?: string;
}) {
  const gradientId = useId();
  const [range, setRange] = useState<Range>("all");

  // Slice by real elapsed time, not by point count. Sampling by index made the
  // 30m / 1h / All control render near-identical data for every range.
  const options = useMemo(() => buildRangeOptions(series), [series]);
  const effective: Range = options.some((option) => option.value === range) ? range : "all";
  const data = useMemo(() => sliceByWindow(series, options, effective), [series, options, effective]);

  const windowed = effective === "all";
  if (data.length === 0) {
    return (
      <Card tone="plate" className={className}>
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="mt-1 text-[12px] text-ink-subtle">
            No history exported by the host — the collector reports a
            point-in-time snapshot only.
          </p>
        </div>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <p className="py-10 text-center font-mono text-[12px] text-ink-subtle">—</p>
        </div>
      </Card>
    );
  }
  const total = data.reduce((sum, row) => sum + row.throughput, 0);
  const errors = data.reduce((sum, row) => sum + row.errors, 0);
  const peak = data.reduce((max, row) => Math.max(max, row.throughput), 0);
  const mean = data.length ? total / data.length : 0;

  return (
    <Card tone="plate" className={className}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="mt-1 text-[12px] text-ink-subtle">
            <span className="font-mono text-ink">{mean.toFixed(1)}</span> mean rps · peak{" "}
            <span className="font-mono text-ink">{peak.toFixed(1)}</span> ·{" "}
            <span className={errors > 0 ? "text-danger" : undefined}>{errors}</span> errors
            <span className="text-ink-subtle"> in {windowed ? "the full window" : options.find((o) => o.value === effective)?.label}</span>
          </p>
          {series.synthetic ? (
            <p className="mt-1.5 text-[11px] text-warn">
              Simulated series — no live gateway counters are connected yet.
            </p>
          ) : null}
        </div>
        <SegmentedControl
          size="xs"
          value={effective}
          onChange={setRange}
          options={options}
        />
      </div>

      <div className="mt-4 min-w-0 px-5 pb-5 sm:px-6 sm:pb-6" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.42} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--hairline)" vertical={false} />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...AXIS} width={44} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--hairline-strong)" }} />
            <Area
              type="monotone"
              dataKey="throughput"
              name="rps"
              stroke={accent}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function LatencyChart({ series, height = 220 }: { series: Series; height?: number }) {
  const [showP95, setShowP95] = useState(true);
  if (series.labels.length === 0) {
    return (
      <Card tone="plate" className="p-5">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Latency envelope</h2>
        <p className="mt-1 text-[12px] text-ink-subtle">
          No agent reports a token counter, so spend is unmeasured — not zero.
        </p>
        <p className="py-10 text-center font-mono text-[12px] text-ink-subtle">—</p>
      </Card>
    );
  }
  const data = series.labels.map((label, index) => ({
    label,
    latency: Math.round(series.latency[index] ?? 0),
    p95: showP95
      ? series.p95 && series.p95[index] != null
        ? Math.round(series.p95[index] as number)
        : Math.round((series.latency[index] ?? 0) * 1.6)
      : null,
  }));

  return (
    <Card tone="plate" className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Latency envelope</h2>
          <p className="mt-1 text-[12px] text-ink-subtle">Mean hop against a p95 estimate</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={showP95 ? "brand" : "neutral"}>
            <span
              className="size-1.5 rounded-full"
              style={{ background: showP95 ? "var(--brand-2)" : "var(--ink-subtle)" }}
            />
            p95 band
          </Badge>
        </div>
      </div>

      <div className="mt-4" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--hairline)" vertical={false} />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={30} />
            <YAxis {...AXIS} width={46} unit="ms" />
            <Tooltip content={<ChartTooltip unit="ms" />} />
            <ReferenceLine
              y={180}
              stroke="var(--warn)"
              strokeDasharray="4 4"
              label={{ value: "SLA 180ms", position: "right", fill: "var(--warn)", fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="latency"
              name="mean"
              stroke="var(--brand)"
              strokeWidth={2.2}
              dot={false}
              animationDuration={900}
            />
            {showP95 ? (
              <Line
                type="monotone"
                dataKey="p95"
                name="p95"
                stroke="var(--brand-2)"
                strokeWidth={1.4}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={1100}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setShowP95(!showP95)}
          className="text-[11px] text-ink-subtle underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          {showP95 ? "hide" : "show"} p95 band
        </button>
      </div>
    </Card>
  );
}

export function ErrorsChart({ series, height = 180 }: { series: Series; height?: number }) {
  if (series.labels.length === 0) {
    return (
      <Card tone="plate" className="p-5">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Errors & rejections</h2>
        <p className="mt-1 text-[12px] text-ink-subtle">
          No agent reports a token counter, so spend is unmeasured — not zero.
        </p>
        <p className="py-10 text-center font-mono text-[12px] text-ink-subtle">—</p>
      </Card>
    );
  }
  const data = series.labels.map((label, index) => ({
    label,
    errors: series.errors[index] ?? 0,
  }));

  return (
    <Card tone="plate" className="p-5">
      <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Errors & rejections</h2>
      <p className="mt-1 text-[12px] text-ink-subtle">
        Failed tool calls per window
        {series.synthetic ? (
          <span className="ml-1 text-warn">· simulated, not measured</span>
        ) : null}
      </p>
      <div className="mt-4" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--hairline)" vertical={false} />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={30} />
            <YAxis {...AXIS} width={40} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="errors" name="errors" fill="var(--danger)" radius={[4, 4, 0, 0]} animationDuration={800} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function TokenSpendChart({ series, height = 200 }: { series: Series; height?: number }) {
  const gradientId = useId();
  if (series.labels.length === 0) {
    return (
      <Card tone="plate" className="p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Token spend</h2>
          <span className="font-mono text-[13px] text-ink">—</span>
        </div>
        <p className="mt-1 text-[12px] text-ink-subtle">
          No agent reports a token counter, so spend is unmeasured — not zero.
        </p>
        <p className="py-10 text-center font-mono text-[12px] text-ink-subtle">—</p>
      </Card>
    );
  }
  const data = series.labels.map((label, index) => ({
    label,
    tokens: series.tokens[index] ?? 0,
  }));
  const total = data.reduce((sum, row) => sum + row.tokens, 0);

  return (
    <Card tone="plate" className="p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em]">Token spend</h2>
        <span className="font-mono text-[13px] text-ink">{formatCompact(total)}</span>
      </div>
      <p className="mt-1 text-[12px] text-ink-subtle">Cumulative inference budget burn</p>
      <div className="mt-4" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--hairline)" vertical={false} />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={30} />
            <YAxis {...AXIS} width={48} tickFormatter={(value: number) => formatCompact(value, 0)} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-3)" />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <Bar
              dataKey="tokens"
              name="tokens"
              fill={`url(#${gradientId})`}
              radius={[4, 4, 0, 0]}
              animationDuration={800}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-ink-subtle">
        Mean hop {formatMs(series.latency.at(-1) ?? 0)} at the tail of the window.
      </p>
    </Card>
  );
}
