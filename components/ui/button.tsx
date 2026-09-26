"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/btn relative inline-flex select-none items-center justify-center gap-2 overflow-hidden rounded-full font-medium transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "text-white shadow-[0_1px_0_oklch(1_0_0/0.28)_inset,0_10px_30px_-10px_var(--brand)] bg-[linear-gradient(100deg,var(--brand-3),var(--brand)_45%,var(--brand-2))] hover:shadow-[0_1px_0_oklch(1_0_0/0.35)_inset,0_18px_44px_-12px_var(--brand)]",
        glass:
          "glass border border-hairline text-ink hover:border-hairline-strong hover:bg-surface-2",
        outline:
          "border border-hairline-strong bg-transparent text-ink hover:bg-surface-2 hover:border-brand/40",
        ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
        subtle: "bg-surface-2 text-ink hover:bg-surface-3 border border-hairline",
        danger:
          "bg-danger/12 text-danger border border-danger/25 hover:bg-danger/20 hover:border-danger/40",
        link: "text-brand hover:text-brand-2 underline-offset-4 hover:underline rounded-md px-0",
      },
      size: {
        xs: "h-7 px-3 text-[11px] [&_svg]:size-3.5",
        sm: "h-9 px-4 text-[13px] [&_svg]:size-4",
        md: "h-10 px-5 text-sm [&_svg]:size-4",
        lg: "h-12 px-7 text-[15px] [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-4.5",
        iconSm: "size-8 rounded-xl [&_svg]:size-4",
        iconXs: "size-7 rounded-lg [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "glass", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </Comp>
  );
});

export function ButtonSheen({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(100deg,transparent,oklch(1_0_0/0.28),transparent)] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/btn:translate-x-full",
        className,
      )}
    />
  );
}

export function ButtonIcon({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-6 place-items-center rounded-full bg-black/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-px [&_svg]:size-3.5 dark:bg-white/12",
        className,
      )}
    >
      {children}
    </span>
  );
}

export { buttonVariants };
