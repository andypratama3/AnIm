"use client";

import { useId, useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

function buildPath(data: number[], width: number, height: number, pad = 2) {
  if (data.length < 2) return { line: "", area: "" };
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((value, index) => {
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
  const { line, area } = useMemo(() => buildPath(data, width, height), [data, height]);
  const last = data.at(-1) ?? 0;

  return (
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
      {showDot ? (
        <circle cx={width} cy={height - 2 - ((last - Math.min(...data)) / (Math.max(...data) - Math.min(...data) || 1)) * (height - 4)} r={2.4} fill={tone} />
      ) : null}
    </svg>
  );
}

export function RadialGauge({
  value,
  size = 108,
  tone = "var(--brand)",
  label,
  sub,
}: {
  value: number;
  size?: number;
  tone?: string;
  label?: string;
  sub?: string;
}) {
  const gradientId = useId();
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
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
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-mono text-xl font-semibold" data-numeric>
            {Math.round(clamped)}
          </div>
          {label ? <div className="text-[10px] uppercase tracking-[0.16em] text-ink-subtle">{label}</div> : null}
          {sub ? <div className="text-[10px] text-ink-subtle">{sub}</div> : null}
        </div>
      </div>
    </div>
  );
}
