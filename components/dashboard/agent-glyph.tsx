"use client";

import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/lib/types";

const ACCENTS: Record<string, [string, string]> = {
  brand: ["var(--brand)", "var(--brand-3)"],
  "brand-2": ["var(--brand-2)", "var(--brand)"],
  "brand-3": ["var(--brand-3)", "var(--brand)"],
  ok: ["var(--ok)", "var(--brand-2)"],
  warn: ["var(--warn)", "var(--brand-3)"],
  danger: ["var(--danger)", "var(--brand-3)"],
  info: ["var(--info)", "var(--brand)"],
};

export const STATUS_COLOR: Record<AgentStatus, string> = {
  online: "var(--ok)",
  busy: "var(--brand)",
  degraded: "var(--warn)",
  offline: "var(--danger)",
};

function initials(id: string): string {
  const cleaned = id.replace(/[^a-z0-9]/gi, " ");
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function AgentGlyph({
  id,
  accent = "brand",
  size = 36,
  status,
  className,
  pulse = true,
}: {
  id: string;
  accent?: string;
  size?: number;
  status?: AgentStatus;
  className?: string;
  pulse?: boolean;
}) {
  const [from, to] = ACCENTS[accent] ?? ACCENTS.brand;
  const ring = status ? STATUS_COLOR[status] : "var(--hairline-strong)";
  const dotSize = Math.max(6, Math.round(size * 0.24));

  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="grid size-full place-items-center rounded-[32%] font-semibold text-white shadow-[0_6px_18px_-8px_var(--brand)]"
        style={{
          background: `linear-gradient(140deg, ${from}, ${to})`,
          fontSize: Math.max(9, Math.round(size * 0.34)),
          letterSpacing: "-0.02em",
        }}
      >
        {initials(id)}
      </span>
      {status ? (
        <span
          className="absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-canvas"
          style={{ width: dotSize, height: dotSize, background: ring }}
        >
          {pulse && status !== "offline" ? (
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: ring, animation: "var(--animate-ring)" }}
            />
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
