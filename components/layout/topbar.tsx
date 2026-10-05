"use client";

import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useEffect } from "react";
import {
  MagnifyingGlassIcon,
  SunIcon,
  MoonIcon,
  ArrowsClockwiseIcon,
  PauseIcon,
  PlayIcon,
  WarningIcon,
  ListIcon,
  ArrowsInIcon,
  ArrowsOutIcon,
  CommandIcon,
  CopyIcon,
  CheckIcon,
  BroadcastIcon,
} from "@phosphor-icons/react";
import { BRAND } from "@/lib/brand";
import { useConsole } from "@/components/providers/console-provider";
import { useMesh } from "@/lib/hooks/use-data";
import { useCopyToClipboard, useMounted, useTicker } from "@/lib/hooks/use-ui";
import { useFullscreen } from "@/lib/hooks/use-fullscreen";
import { formatClock, formatRelative, formatPort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge, Dot, Kbd } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/menus";
import { Sheet, SheetContent } from "@/components/ui/dialog";
import { BrandMark, SidebarNav } from "@/components/layout/sidebar-nav";
import { cn } from "@/lib/utils";

const PAGE_META: Record<string, { title: string; sub: string }> = {
  "/": { title: "Overview", sub: "Mesh pulse" },
  "/workspace": { title: "Workspace", sub: "Office view" },
  "/agents": { title: "Agents", sub: "Profile topology" },
  "/activity": { title: "Activity", sub: "Recorded events" },
  "/kanban": { title: "Kanban", sub: "Task flow" },
  "/analytics": { title: "Analytics", sub: "Trends" },
  "/discussion": { title: "Discussion", sub: "Agent channel" },
  "/notes": { title: "Notes", sub: "Working notes" },
  "/settings": { title: "Settings", sub: "Configuration" },
};

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const pathname = usePathname();
  const meta = PAGE_META[pathname] ?? { title: "AnIm", sub: BRAND.expansion };
  const { live, setLive, interval, setInterval: setRefresh, setPaletteOpen, setFocusAgent } =
    useConsole();
  const { data, isLoading, mutate } = useMesh();
  const [copied, copy] = useCopyToClipboard();
  const mounted = useMounted();
  const now = useTicker(1000);
  const fullscreen = useFullscreen();

  const degraded = (data?.totals.degraded ?? 0) + (data?.totals.offline ?? 0);

  /**
   * Every route here is a client component, so none of them can export
   * `metadata` and the layout's `default` title ("Overview · AnIm") was being
   * served for all of them: eight tabs, seven of them identical, and "Overview"
   * on the settings page. The nav label is already the single source of truth,
   * so the title follows it instead of being restated per page where it would
   * drift. `/discussion` is a server component and sets the same string
   * statically; this only agrees with it.
   */
  useEffect(() => {
    const previous = document.title;
    document.title = `${meta.title} · ${BRAND.name}`;
    return () => {
      document.title = previous;
    };
  }, [meta.title]);

  return (
    <header className="sticky top-0 z-30 glass-deep border-b border-hairline">
      <div className="flex h-16 items-center gap-2.5 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="iconSm"
          className="lg:hidden"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
        >
          <ListIcon size={18} weight="bold" />
        </Button>

        <div className="min-w-0 flex-1">
          <motion.div
            key={meta.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
            className="flex items-center gap-2.5"
          >
            {/* A <p>, not an <h1>: this is the route label in the chrome, and the
                page's own PageHeader already carries the route's <h1>. Two <h1>s
                per page duplicated the same words and flattened the outline, and
                the audit's "an h1 exists" check was satisfied by either one. */}
            <p className="truncate text-[17px] font-semibold tracking-[-0.03em]">{meta.title}</p>
            <span className="hidden text-[11px] uppercase tracking-[0.18em] text-ink-subtle sm:inline">
              {meta.sub}
            </span>
          </motion.div>
        </div>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden h-9 w-64 items-center gap-2.5 rounded-full border border-hairline bg-surface-2/60 px-3.5 text-left text-[13px] text-ink-subtle transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-hairline-strong hover:bg-surface-2 md:flex xl:w-80"
        >
          <MagnifyingGlassIcon size={15} className="shrink-0" />
          <span className="flex-1">Search or run a command</span>
          <span className="flex items-center gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        <Button
          variant="ghost"
          size="iconSm"
          className="md:hidden"
          onClick={() => setPaletteOpen(true)}
          aria-label="Open command palette"
        >
          <MagnifyingGlassIcon size={17} />
        </Button>

        <Tabs
          value={live ? "live" : "paused"}
          onValueChange={(value) => setLive(value === "live")}
          className="hidden sm:block"
        >
          <TabsList>
            <TabsTrigger value="live" className="gap-1.5">
              <BroadcastIcon
                size={13}
                weight={live ? "fill" : "regular"}
                className={live ? "text-ok" : undefined}
              />
              Live
            </TabsTrigger>
            <TabsTrigger value="paused" className="gap-1.5">
              <PauseIcon size={12} weight="fill" />
              Hold
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          variant="ghost"
          size="iconSm"
          className="sm:hidden"
          onClick={() => setLive(!live)}
          aria-label={live ? "Pause live updates" : "Resume live updates"}
        >
          {live ? <PauseIcon size={15} weight="fill" /> : <PlayIcon size={15} weight="fill" />}
        </Button>

        <Select value={String(interval)} onValueChange={(value) => setRefresh(Number(value))}>
          <SelectTrigger className="hidden w-[6.5rem] lg:inline-flex" aria-label="Refresh interval">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[2500, 5000, 10000, 30000].map((ms) => (
              <SelectItem key={ms} value={String(ms)}>
                {ms / 1000}s
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="View options">
              <ArrowsClockwiseIcon size={16} className={cn(isLoading && "animate-spin")} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Console</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void mutate()}>
              <ArrowsClockwiseIcon /> Refresh now
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setLive(true);
                setRefresh(2500);
              }}
            >
              <BroadcastIcon /> Go live at 2.5s
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                if (data) void copy(data.agents.map((agent) => `${agent.id}${formatPort(agent.port)}`).join("\n"));
              }}
            >
              {copied ? <CheckIcon className="text-ok" /> : <CopyIcon />} Copy peer map
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Jump to agent</DropdownMenuLabel>
            {(data?.agents ?? []).slice(0, 6).map((agent) => (
              <DropdownMenuItem key={agent.id} onSelect={() => setFocusAgent(agent.id)}>
                <Dot
                  tone={agent.status === "online" ? "var(--ok)" : agent.status === "offline" ? "var(--danger)" : "var(--warn)"}
                />
                {agent.id}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="iconSm"
          className="relative hidden sm:inline-flex"
          onClick={() => void fullscreen.toggle()}
          disabled={!fullscreen.supported}
          aria-label={fullscreen.isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={
            fullscreen.supported
              ? `${fullscreen.isFullscreen ? "Exit" : "Enter"} fullscreen (F)`
              : "Fullscreen is not available in this browser"
          }
        >
          {fullscreen.isFullscreen ? <ArrowsInIcon size={16} /> : <ArrowsOutIcon size={16} />}
          {degraded > 0 ? (
            <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-warn text-[9px] font-bold text-canvas">
              {degraded}
            </span>
          ) : null}
        </Button>

        <Button
          variant="ghost"
          size="iconSm"
          className="hidden md:inline-flex"
          onClick={() => {
            if (mounted) void copy(window.location.href);
          }}
          aria-label="Copy console link"
        >
          {copied ? <CheckIcon size={16} className="text-ok" /> : <CommandIcon size={16} />}
        </Button>

        <ThemeToggle mounted={mounted} />

        <div className="hidden items-center gap-2.5 rounded-full border border-hairline bg-surface-2/60 py-1.5 pr-3.5 pl-1.5 xl:flex">
          <span className="relative grid size-7 place-items-center rounded-full bg-[linear-gradient(135deg,var(--brand-3),var(--brand))] text-[11px] font-semibold text-white">
            AP
          </span>
          <span className="leading-tight">
            <span className="block text-[12px] font-medium">Andy Pratama</span>
            <span className="block font-mono text-[10px] text-ink-subtle">
              {mounted ? formatClock(now) : "--:--:--"}
            </span>
          </span>
        </div>
      </div>

      <div className="relative h-px w-full bg-hairline">
        <motion.span
          className="absolute inset-y-0 left-0 w-full origin-left bg-[linear-gradient(90deg,var(--brand-3),var(--brand),var(--brand-2))]"
          animate={{ scaleX: live ? 1 : 0.001 }}
          transition={{
            duration: live ? interval / 1000 : 0.3,
            ease: "linear",
            repeat: live ? Infinity : 0,
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={data?.source === "live" ? "ok" : "brand"}>
            <Dot tone={data?.source === "live" ? "var(--ok)" : "var(--brand)"} pulse />
            {data?.source === "live" ? "Gateway live" : "Synthetic feed"}
          </Badge>
          {degraded > 0 ? (
            <Badge tone="warn">
              <WarningIcon size={12} weight="fill" />
              {degraded} degraded
            </Badge>
          ) : (
            <Badge tone="ok">All peers nominal</Badge>
          )}
          <Badge tone="neutral" className="hidden sm:inline-flex">
            <span className="font-mono">{data ? formatRelative(data.generatedAt) : "syncing"}</span>
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-subtle">
          <span className="hidden sm:inline">Refresh {live ? `every ${interval / 1000}s` : "held"}</span>
        </div>
      </div>
    </header>
  );
}

function ThemeToggle({ mounted }: { mounted: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = mounted && resolvedTheme === "dark";

  return (
    <Button variant="glass" size="iconSm" aria-label="Toggle colour theme" onClick={() => setTheme(dark ? "light" : "dark")}>
      {!mounted ? (
        <SunIcon size={16} />
      ) : (
        <motion.span
          key={dark ? "moon" : "sun"}
          initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="grid place-items-center"
        >
          {dark ? <MoonIcon size={16} weight="fill" /> : <SunIcon size={16} weight="fill" />}
        </motion.span>
      )}
    </Button>
  );
}

export function MobileNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-0">
        <div className="flex h-full flex-col">
          <div className="border-b border-hairline px-5 py-4">
            <BrandMark />
          </div>
          <SidebarNav onNavigate={() => onOpenChange(false)} />
          <div className="border-t border-hairline px-5 py-3 text-[11px] text-ink-subtle">
            {BRAND.name} v{BRAND.version} · {BRAND.expansion}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
