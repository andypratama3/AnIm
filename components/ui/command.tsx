"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-[1.5rem] bg-surface text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function CommandInput({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-3 border-b border-hairline px-4">
      <MagnifyingGlassIcon size={16} className="shrink-0 text-ink-subtle" />
      <CommandPrimitive.Input
        className={cn(
          "h-14 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle",
          className,
        )}
        {...props}
      />
      {children}
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn("max-h-[22rem] overflow-y-auto p-2", className)}
      {...props}
    />
  );
}

export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      className="px-3 py-10 text-center text-[13px] text-ink-subtle"
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  heading,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      heading={heading}
      className={cn("overflow-hidden [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-ink-subtle", className)}
      {...props}
    />
  );
}

export function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-ink-muted transition-colors duration-200 data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export function CommandSeparator(props: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator className="mx-1 my-1.5 h-px bg-hairline" {...props} />;
}

export function CommandFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-hairline px-4 py-2.5 text-[11px] text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function CommandDialog({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Dialog> & { className?: string }) {
  return (
    <Dialog {...props}>
      <DialogContent
        showClose={false}
        className={cn("top-[18%] max-w-2xl translate-y-0 p-0", className)}
      >
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}
