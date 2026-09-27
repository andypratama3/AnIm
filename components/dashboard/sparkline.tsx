"use client";

import { useId, useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Keep only real, finite samples, and report whether anything was dropped.
 *
 * `Math.min(...[])` is `Infinity` and `Math.max(...[])` is `-Infinity`, so an
 * empty series silently produced a span of `-Infinity` — and the usual
 * `span || 1` guard does not catch that, because `Infinity` is truthy. The
 * result was `NaN` in an SVG `d` attribute. A `null` smuggled in from JSON does
 * the same thing, since `Math.min(null, 1)` is `0` but `Math.min(null)` with a
 * single null is `NaN`.
 *
 * Filtering first means the caller never has to defend against either case, and
 * `dropped` lets the UI say "some points were not reported" rather than quietly
 * drawing a shorter line than it has data for.
 */
function finiteSamples(data: number[]): { points: number[]; dropped: number } {
  const points = data.filter((value) => typeof value === "number" && Number.isFinite(value));
  return { points, dropped: data.length - points.length };
}

/** `samples` must already be finite; `Sparkline` filters before calling. */
function buildPath(
  samples: number[],
  width: number,
  height: number,
  pad = 2,
): { line: string; area: string } {
  if (samples.length < 2) return { line: "", area: "" };
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const span = max - min || 1;
  const stepX = width / (samples.length - 1);
  const points = samples.map((value, index) => {
    const x = index * stepX;
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  let line = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const mx = (px + cx) / 2;
    line += ` C ${mx.toFixed(2)} ${py.toFixed(2)}, ${mx.toFixed(2)} ${cy.toFixed(2)}, ${cx.toFixed(2)} ${cy.toFixed(2)}`;
  }

  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return { line, area };
}

export function Sparkline({
  data,
  tone = "var(--brand)",
  height = 40,
  className,
  strokeWidth = 1.75,
  showDot = true,
}: {
  data: number[];
  tone?: string;
  height?: number;
  className?: string;
  strokeWidth?: number;
  showDot?: boolean;
}) {
  const gradientId = useId();
  const width = 240;
  const { points: samples, dropped } = useMemo(() => finiteSamples(data), [data]);
  const { line, area } = useMemo(() => buildPath(samples, width, height), [samples, height]);

  // The end dot used to recompute its own y from `Math.min(...data)`, unguarded.
  // With an empty series that is `Infinity`, the span is `-Infinity`, and the
  // `|| 1` fallback does not fire because `Infinity` is truthy — so `cy` became
  // `NaN` and the browser logged `<circle> attribute cy: Expected length, "NaN"`.
  // A dot is only meaningful with at least one real sample, and it must sit on
  // the same scale as the path, so both come from one function.
  const lastDot = useMemo(() => {
    if (samples.length === 0) return null;
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const span = max - min || 1;
    const last = samples[samples.length - 1];
    return {
      y: height - 2 - ((last - min) / span) * (height - 4),
      atEnd: samples.length > 1,
    };
  }, [samples, height]);

  const empty = samples.length === 0;
  const note = empty
    ? "No samples were reported by the collector."
    : dropped
      ? `${dropped} point${dropped === 1 ? "" : "s"} not reported by the collector and not drawn.`
      : null;

  return (
    <div className="relative w-full" style={{ height }}>
      {note ? (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-ink-subtle">
          {note}
        </span>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={cn("w-full overflow-visible", className)}
        style={{ height }}
        aria-hidden
      >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.32" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <motion.path
        d={line}
        fill="none"
        stroke={tone}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
      {showDot && lastDot && lastDot.atEnd && Number.isFinite(lastDot.y) ? (
        <circle cx={width} cy={lastDot.y} r={2.4} fill={tone} />
      ) : null}
      </svg>
    </div>
  );
}

export function RadialGauge({
  value,
  size = 108,
  tone = "var(--brand)",
  label,
  sub,
}: {
  /** `null` means "not reported", which must not be drawn as 0. */
  value: number | null;
  size?: number;
  tone?: string;
  label?: string;
  sub?: string;
}) {
  const gradientId = useId();
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // `typeof value === "number"` is true for NaN, and `Math.max(0, Math.min(100,
  // NaN))` is NaN — which then lands in `strokeDasharray`. A JSON payload can
  // carry NaN, so the guard has to be finiteness, not type.
  const measured = typeof value === "number" && Number.isFinite(value);
  const clamped = measured ? Math.max(0, Math.min(100, value as number)) : 0;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-3)" />
            <stop offset="50%" stopColor={tone} />
            <stop offset="100%" stopColor="var(--brand-2)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          // An unreported metric draws no arc. A full-circle dash with zero
          // offset would read as a perfect score, which is the one thing an
          // absent measurement must never look like.
          style={measured ? undefined : { strokeDasharray: "0 0", stroke: "none" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-mono text-xl font-semibold" data-numeric>
            {measured ? Math.round(clamped) : "—"}
          </div>
          {label ? <div className="text-[10px] uppercase tracking-[0.16em] text-ink-subtle">{label}</div> : null}
          {sub ? <div className="text-[10px] text-ink-subtle">{sub}</div> : null}
        </div>
      </div>
    </div>
  );
}
