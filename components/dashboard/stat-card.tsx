"use client";

import { motion } from "motion/react";
import { Sparkline } from "@/components/dashboard/sparkline";
import { Badge } from "@/components/ui/badge";
import { useCountUp } from "@/lib/hooks/use-ui";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  /**
   * Accepts a string so an unmeasured metric can render as an em dash instead of
   * a fabricated zero. Numbers keep the count-up animation.
   */
  value: number | string;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  data?: number[];
  tone?: string;
  delta?: number;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
  sparkHeight?: number;
  onClick?: () => void;
};

export function StatCard({
  label,
  value,
  suffix,
  prefix,
  decimals = 0,
  data,
  tone = "var(--brand)",
  delta,
  hint,
  icon,
  className,
  sparkHeight = 34,
  onClick,
}: StatCardProps) {
  const isNumber = typeof value === "number";
  const animated = useCountUp(isNumber ? value : 0);
  const shown = !isNumber
    ? value
    : decimals > 0
      ? animated.toFixed(decimals)
      : Math.round(animated).toLocaleString();

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      onClick={onClick}
      whileHover={onClick ? { y: -4 } : undefined}
      className={cn(
        "plate group relative overflow-hidden rounded-[1.5rem] p-4",
        onClick && "cursor-pointer transition-all duration-700",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full opacity-0 blur-2xl transition-opacity duration-700 group-hover:opacity-40"
        style={{ background: tone }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
          {label}
        </span>
        {icon ? <span style={{ color: tone }}>{icon}</span> : null}
      </div>

      <div className="relative mt-2 flex items-end gap-2">
        <span className="font-mono text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink tabular-nums">
          {prefix}
          {shown}
          {suffix}
        </span>
        {typeof delta === "number" ? (
          <Badge tone={delta >= 0 ? "ok" : "warn"} size="sm" className="mb-0.5">
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </Badge>
        ) : null}
      </div>

      {data && data.length > 1 ? (
        <Sparkline
          data={data}
          tone={tone}
          height={sparkHeight}
          className="relative mt-3 -mb-1 opacity-90"
        />
      ) : null}

      {hint ? <p className="relative mt-2 text-[11px] text-ink-subtle">{hint}</p> : null}
    </motion.div>
  );
}
