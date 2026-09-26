"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-xl border border-hairline bg-surface-2/70 px-3.5 text-sm text-ink shadow-[inset_0_1px_0_oklch(1_0_0/0.05)] transition-all duration-300 placeholder:text-ink-subtle hover:border-hairline-strong focus:border-brand/50 focus:bg-surface-2 focus:outline-none focus:ring-4 focus:ring-brand/10",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none rounded-xl border border-hairline bg-surface-2/70 px-3.5 py-3 text-sm leading-relaxed text-ink transition-all duration-300 placeholder:text-ink-subtle hover:border-hairline-strong focus:border-brand/50 focus:bg-surface-2 focus:outline-none focus:ring-4 focus:ring-brand/10",
        className,
      )}
      {...props}
    />
  );
});

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {label}
      </span>
      {children}
      {hint ? <span className="block text-[12px] text-ink-subtle">{hint}</span> : null}
    </label>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle", className)}
      {...props}
    />
  );
}
