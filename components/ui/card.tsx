"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva("relative transition-[transform,box-shadow,border-color] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]", {
  variants: {
    tone: {
      plate: "plate min-w-0 rounded-[1.75rem]",
      glass: "glass min-w-0 rounded-[1.75rem] border border-hairline",
      nested: "plate-nested min-w-0 rounded-xl",
      bare: "min-w-0 rounded-[1.75rem]",
    },
    interactive: {
      true: "hover:-translate-y-0.5 hover:shadow-lift hover:border-hairline-strong cursor-pointer",
      false: "",
    },
    padding: {
      none: "",
      sm: "p-4",
      md: "p-5",
      lg: "p-6 sm:p-7",
    },
  },
  defaultVariants: { tone: "plate", interactive: false, padding: "none" },
});

export type CardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, tone, interactive, padding, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(cardVariants({ tone, interactive, padding }), className)}
      {...props}
    />
  );
});

export function CardHeader({
  className,
  eyebrow,
  title,
  description,
  actions,
}: {
  className?: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 p-5 sm:p-6", className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? <div className="text-ink-subtle">{eyebrow}</div> : null}
        <h3 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
        {description ? (
          <p className="max-w-prose text-[13px] leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[15px] font-semibold tracking-[-0.02em]", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] leading-relaxed text-ink-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-3 border-t border-hairline px-5 py-3.5 sm:px-6", className)}
      {...props}
    />
  );
}

const eyebrowVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
  {
    variants: {
      tone: {
        neutral: "bg-surface-3 text-ink-subtle",
        brand: "bg-brand/12 text-brand",
        ok: "bg-ok/12 text-ok",
        warn: "bg-warn/14 text-warn",
        danger: "bg-danger/12 text-danger",
        info: "bg-info/12 text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Eyebrow({
  className,
  tone,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof eyebrowVariants>) {
  return (
    <span className={cn(eyebrowVariants({ tone }), className)} {...props}>
      {children}
    </span>
  );
}

export function Divider({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn("h-px w-full bg-hairline", className)} {...props} />;
}

export { cardVariants };
