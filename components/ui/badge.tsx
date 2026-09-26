"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-300",
  {
    variants: {
      tone: {
        neutral: "border-hairline bg-surface-2 text-ink-muted",
        brand: "border-brand/25 bg-brand/10 text-brand",
        ok: "border-ok/25 bg-ok/10 text-ok",
        warn: "border-warn/30 bg-warn/12 text-warn",
        danger: "border-danger/25 bg-danger/10 text-danger",
        info: "border-info/25 bg-info/10 text-info",
        solid: "border-transparent bg-ink text-canvas",
      },
      size: {
        sm: "px-2 py-0 text-[10px]",
        md: "",
        lg: "px-3 py-1 text-xs",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

const kbdVariants = cva(
  "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-hairline bg-surface-2 px-1.5 font-mono text-[10px] font-medium text-ink-subtle shadow-[0_1px_0_oklch(0_0_0/0.06)]",
);

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <kbd className={cn(kbdVariants(), className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-xl", className)} {...props} />;
}

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-hairline",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

export function Dot({
  className,
  tone = "var(--ok)",
  pulse = false,
}: {
  className?: string;
  tone?: string;
  pulse?: boolean;
}) {
  return (
    <span className={cn("relative grid size-2 place-items-center", className)}>
      {pulse ? (
        <span
          className="absolute inset-0 rounded-full opacity-70"
          style={{ background: tone, animation: "var(--animate-ring)" }}
        />
      ) : null}
      <span className="size-2 rounded-full" style={{ background: tone }} />
    </span>
  );
}

export function Meter({
  value,
  max = 100,
  tone = "var(--brand)",
  className,
  height = 6,
}: {
  value: number;
  max?: number;
  tone?: string;
  className?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-full bg-surface-3", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, color-mix(in oklab, ${tone} 55%, transparent), ${tone})`,
        }}
      />
    </div>
  );
}

export { badgeVariants, kbdVariants };
