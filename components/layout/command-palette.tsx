"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import {
  SquaresFourIcon,
  RobotIcon,
  PulseIcon,
  KanbanIcon,
  ChartLineUpIcon,
  NotebookIcon,
  GearSixIcon,
  BroadcastIcon,
  ArrowsClockwiseIcon,
  PaintBrushIcon,
  SunIcon,
  MoonIcon,
  RowsIcon,
  MagnifyingGlassIcon,
  CommandIcon,
  PlusIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";
import { NAV_GROUPS } from "@/lib/brand";
import { useConsole, type Density } from "@/components/providers/console-provider";
import { useMesh } from "@/lib/hooks/use-data";
import { useKeyCombo, useMounted } from "@/lib/hooks/use-ui";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd, Dot } from "@/components/ui/badge";
import { STATUS_COLOR } from "@/components/dashboard/agent-glyph";

const ICONS: Record<string, React.ComponentType<{ size?: number; weight?: "regular" | "fill" | "bold" }>> = {
  SquaresFour: SquaresFourIcon,
  Robot: RobotIcon,
  Pulse: PulseIcon,
  Kanban: KanbanIcon,
  ChartLineUp: ChartLineUpIcon,
  Notebook: NotebookIcon,
  GearSix: GearSixIcon,
};

export function CommandPalette() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const {
    paletteOpen,
    setPaletteOpen,
    live,
    setLive,
    interval,
    setInterval: setRefresh,
    density,
    setDensity,
    setFocusAgent,
  } = useConsole();
  const { data, mutate } = useMesh();

  useKeyCombo([
    {
      combo: (event) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k",
      handler: () => setPaletteOpen(!paletteOpen),
    },
  ]);

  const run = (fn: () => void) => {
    setPaletteOpen(false);
    window.setTimeout(fn, 60);
  };

  const cycleInterval = useMemo(() => {
    const options = [2500, 5000, 10000, 30000];
    const index = options.indexOf(interval);
    return () => setRefresh(options[(index + 1) % options.length]);
  }, [interval, setRefresh]);

  const nextDensity: Density = density === "comfortable" ? "compact" : "comfortable";

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <CommandInput placeholder="Search agents, views and commands…" />
      <CommandList>
        <CommandEmpty>
          <span className="flex flex-col items-center gap-2">
            <MagnifyingGlassIcon size={20} className="opacity-50" />
            No match. Try an agent id like <span className="font-mono">frontend</span>.
          </span>
        </CommandEmpty>

        <CommandGroup heading="Navigate">
          {NAV_GROUPS.flatMap((group) =>
            group.items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <CommandItem
                  key={item.href}
                  value={`go ${item.label} ${item.href}`}
                  onSelect={() => run(() => router.push(item.href))}
                >
                  <Icon size={16} />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[11px] text-ink-subtle">{item.hint}</span>
                </CommandItem>
              );
            }),
          )}
        </CommandGroup>

        <CommandGroup heading="Agents">
          {(data?.agents ?? []).map((agent) => (
            <CommandItem
              key={agent.id}
              value={`agent ${agent.id} ${agent.role} ${agent.port}`}
              onSelect={() => run(() => setFocusAgent(agent.id))}
            >
              <Dot tone={STATUS_COLOR[agent.status]} />
              <span className="flex-1 font-medium text-ink">{agent.id}</span>
              <span className="font-mono text-[11px] text-ink-subtle">:{agent.port}</span>
              <span className="text-[11px] text-ink-subtle">{Math.round(agent.health)}%</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Console">
          <CommandItem
            value="toggle live streaming"
            onSelect={() =>
              run(() => {
                setLive(!live);
                toast.success(live ? "Live updates held" : "Live updates resumed", {
                  description: live ? "The mesh snapshot is frozen." : `Polling every ${interval / 1000}s.`,
                });
              })
            }
          >
            <BroadcastIcon size={16} className={live ? "text-ok" : undefined} />
            {live ? "Hold live updates" : "Resume live updates"}
          </CommandItem>
          <CommandItem
            value="cycle refresh interval"
            onSelect={() =>
              run(() => {
                cycleInterval();
                toast("Refresh interval changed");
              })
            }
          >
            <ArrowsClockwiseIcon size={16} />
            Cycle refresh interval
            <span className="ml-auto font-mono text-[11px] text-ink-subtle">
              {interval / 1000}s
            </span>
          </CommandItem>
          <CommandItem
            value="refresh now pull snapshot"
            onSelect={() =>
              run(() => {
                void mutate();
                toast.success("Snapshot pulled");
              })
            }
          >
            <ArrowsClockwiseIcon size={16} />
            Pull a fresh snapshot
          </CommandItem>
          <CommandItem
            value="toggle density compact comfortable"
            onSelect={() =>
              run(() => {
                setDensity(nextDensity);
                toast(`Density set to ${nextDensity}`);
              })
            }
          >
            <RowsIcon size={16} />
            Switch to {nextDensity} density
          </CommandItem>
          <CommandItem
            value="toggle theme light dark"
            onSelect={() =>
              run(() => {
                const next = mounted && theme === "dark" ? "light" : "dark";
                setTheme(next);
                toast(`Theme: ${next}`);
              })
            }
          >
            {mounted && theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
            Switch to {mounted && theme === "dark" ? "light" : "dark"} theme
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Shortcuts">
          <CommandItem value="keyboard shortcuts help" onSelect={() => run(() => router.push("/settings#shortcuts"))}>
            <CommandIcon size={16} />
            View keyboard shortcuts
          </CommandItem>
          <CommandItem value="create new task kanban" onSelect={() => run(() => router.push("/kanban?new=1"))}>
            <PlusIcon size={16} />
            Create a task
          </CommandItem>
          <CommandItem value="approvals review pending" onSelect={() => run(() => router.push("/activity?level=warn"))}>
            <CheckCircleIcon size={16} />
            Review warnings
          </CommandItem>
          <CommandItem value="vault notes obsidian" onSelect={() => run(() => router.push("/notes"))}>
            <PaintBrushIcon size={16} />
            Open the vault
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <CommandFooter>
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> select
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>esc</Kbd> close
        </span>
        <span className="ml-auto">AnIm command surface</span>
      </CommandFooter>
    </CommandDialog>
  );
}
