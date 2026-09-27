"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BrandMark, SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileNav, Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/layout/command-palette";
import { GlobalShortcuts } from "@/components/layout/shortcuts";
import { AgentDrawer } from "@/components/dashboard/agent-drawer";
import {
  AuroraBackground,
  GrainOverlay,
} from "@/components/layout/aurora-background";
import { useMesh } from "@/lib/hooks/use-data";
import { useMounted } from "@/lib/hooks/use-ui";
import { BRAND } from "@/lib/brand";
import { RadialGauge } from "@/components/dashboard/sparkline";
import { meshHealthScore } from "@/lib/data/engine";
import { Toaster } from "sonner";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/controls";

function SidebarFrame({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useMesh();
  const score = data
    ? meshHealthScore(
        data.agents,
        data.agents.reduce((s, a) => s + (a.load ?? 0), 0),
      )
    : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-hairline px-5 py-5">
        <BrandMark />
      </div>

      <SidebarNav onNavigate={onNavigate} />

      <div className="border-t border-hairline p-4">
        <div className="rounded-2xl border border-hairline bg-surface-2/60 p-3.5">
          <div className="flex items-center gap-3">
            <RadialGauge value={score} size={62} label="health" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium">Mesh integrity</p>
              <p className="mt-0.5 text-[11px] leading-snug text-ink-subtle">
                {data
                  ? `${data.totals.online} online · ${
                      data.totals.tasks == null
                        ? "queue depth not reported"
                        : `${data.totals.tasks} queued`
                    }`
                  : "Connecting to gateways"}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-3 px-1 text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
          {BRAND.name} v{BRAND.version}
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mounted = useMounted();
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={400}>
      <div className="relative min-h-[100dvh]">
        <AuroraBackground />
        <GrainOverlay />

        <div className="flex min-h-[100dvh]">
          <aside className="sticky top-0 hidden h-[100dvh] w-[17.5rem] shrink-0 border-r border-hairline glass-deep lg:block">
            <SidebarFrame />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
            <AnimatePresence mode="wait">
              <motion.main
                key={pathname}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
                className="flex-1 px-4 pb-16 sm:px-6 lg:px-8"
              >
                <div className="mx-auto w-full max-w-[110rem] pt-6">
                  {children}
                </div>
              </motion.main>
            </AnimatePresence>
          </div>
        </div>

        <GlobalShortcuts />
      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />
        <CommandPalette />
        <AgentDrawer />

        <Toaster
          position="bottom-right"
          theme={mounted && resolvedTheme === "dark" ? "dark" : "light"}
          toastOptions={{
            classNames: {
              toast:
                "group rounded-2xl border border-hairline bg-surface text-ink shadow-lift",
              description: "text-ink-muted",
              actionButton: "bg-brand text-white rounded-full",
            },
          }}
        />
      </div>
    </TooltipProvider>
  );
}

export function ShellFallback() {
  return (
    <div className="grid min-h-[100dvh] place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-10 animate-spin rounded-full border-2 border-hairline border-t-brand" />
        <p className="text-[13px] text-ink-subtle">Waking the mesh…</p>
      </div>
    </div>
  );
}
