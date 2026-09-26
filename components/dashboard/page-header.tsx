"use client";

import { motion } from "motion/react";
import { ArrowLeftIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Eyebrow, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      className={cn("flex flex-wrap items-end justify-between gap-4", className)}
    >
      <div className="min-w-0">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="mt-1.5 text-[clamp(1.6rem,3.2vw,2.15rem)] font-semibold leading-[1.08] tracking-[-0.035em]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </motion.header>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  padding = "md",
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  padding?: "none" | "sm" | "md" | "lg";
}) {
  return (
    <Card tone="plate" className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em]">{title}</h2>
          {description ? (
            <p className="mt-1 text-[12px] text-ink-subtle">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div
        className={cn(
          "min-w-0 px-5 pb-5 pt-4 sm:px-6 sm:pb-6",
          padding === "none" && "px-0 sm:px-0",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </Card>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-surface-2/50 p-2">
      {children}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
}: {
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  size?: "xs" | "sm";
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-hairline bg-surface/60 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-full font-medium transition-colors duration-300",
              size === "xs" ? "h-6 px-2.5 text-[11px]" : "h-7 px-3 text-[12px]",
              active ? "text-white" : "text-ink-muted hover:text-ink",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`seg-${options.map((item) => item.value).join("-")}`}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full bg-[linear-gradient(100deg,var(--brand-3),var(--brand))]"
              />
            ) : null}
            <span className="relative z-10">{option.label}</span>
            {typeof option.count === "number" ? (
              <span
                className={cn(
                  "relative z-10 rounded-full px-1.5 font-mono text-[10px]",
                  active ? "bg-white/20" : "bg-surface-3 text-ink-subtle",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-hairline-strong px-6 py-12 text-center">
      {icon ? <span className="text-ink-subtle">{icon}</span> : null}
      <p className="text-[14px] font-medium">{title}</p>
      <p className="max-w-sm text-[12px] text-ink-subtle">{description}</p>
      {action}
    </div>
  );
}

export function BackLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 text-[12px] text-ink-subtle transition-colors hover:text-ink"
    >
      <ArrowLeftIcon size={13} />
      Back
      <ArrowRightIcon size={0} />
    </button>
  );
}

export function LivePill({ live, label = "live" }: { live: boolean; label?: string }) {
  return (
    <Badge tone={live ? "ok" : "neutral"}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          live ? "bg-ok animate-[var(--animate-breathe)]" : "bg-ink-subtle",
        )}
      />
      {live ? label : "held"}
    </Badge>
  );
}
