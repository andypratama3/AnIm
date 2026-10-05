"use client";

import { useState } from "react";
import {
  ArrowsClockwiseIcon,
  BroadcastIcon,
  CheckIcon,
  CopyIcon,
  PaintBrushIcon,
  PlugsConnectedIcon,
  RowsIcon,
  ShieldCheckIcon,
  TerminalIcon,
  MoonIcon,
  SunIcon,
  GaugeIcon,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useConsole, resetConsolePreferences, type Density } from "@/components/providers/console-provider";
import { useMesh } from "@/lib/hooks/use-data";
import { useCopyToClipboard, useMounted, useTicker } from "@/lib/hooks/use-ui";
import { PROFILES, MODEL_DEFAULT, PROVIDER, MCP_TOOLS, VAULT_PATH } from "@/lib/data/profiles";
import { formatMs, formatRelative } from "@/lib/format";
import { PageHeader, SectionCard, SegmentedControl } from "@/components/dashboard/page-header";
import { Switch, Tabs, TabsList, TabsTrigger, TabsContent, Hint, TooltipRoot, TooltipTrigger, TooltipContent } from "@/components/ui/controls";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/menus";
import { Button } from "@/components/ui/button";
import { Badge, Kbd, Dot, Separator } from "@/components/ui/badge";
import { AgentGlyph } from "@/components/dashboard/agent-glyph";
import { BRAND } from "@/lib/brand";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const INTERVALS = [
  { value: 2500, label: "2.5s" },
  { value: 5000, label: "5s" },
  { value: 10000, label: "10s" },
  { value: 30000, label: "30s" },
];

const GATEWAY =
  process.env.ANIM_GATEWAY_URLS ?? "(not configured — using simulated feed)";

const SHORTCUTS: Array<[string, string]> = [
  ["⌘K", "Open the command palette"],
  ["Space", "Hold / resume live updates"],
  ["R", "Pull a fresh snapshot"],
  ["T", "Toggle light / dark theme"],
  ["D", "Toggle compact density"],
  ["/", "Focus the search field"],
  ["1 – 9", "Inspect a peer by index"],
  ["Esc", "Close drawer, dialog or palette"],
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const { live, setLive, interval, setInterval: setRefresh, density, setDensity, setPaletteOpen } =
    useConsole();
  const { data, mutate } = useMesh();
  const hierarchy = data?.hierarchy ?? [];
  const now = useTicker(30_000);
  const [copied, copy] = useCopyToClipboard();
  const [hotkeys, setHotkeys] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [sound, setSound] = useState(false);
  const [telemetry, setTelemetry] = useState(true);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Runtime preferences for this console. Everything here is local to the browser; nothing is written back to the mesh."
        meta={
          <>
            <Badge tone="brand">{BRAND.name}</Badge>
            <Badge tone="neutral">v{BRAND.version}</Badge>
            <Badge tone={data?.source === "live" ? "ok" : "neutral"}>
              <Dot tone={data?.source === "live" ? "var(--ok)" : "var(--ink-subtle)"} pulse={live} />
              {data?.source === "live" ? "live" : "simulated"}
            </Badge>
          </>
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => setPaletteOpen(true)}>
            <TerminalIcon size={15} />
            Command palette
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Live updates" description="How often the console polls the gateways.">
          <div className="space-y-5">
            <Row
              icon={<BroadcastIcon size={16} />}
              label="Stream snapshots"
              hint="When off the mesh snapshot is frozen and shows the last pull time."
            >
              <Switch checked={live} onCheckedChange={setLive} aria-label="Stream snapshots" />
            </Row>

            <Separator />

            <div>
              <p className="mb-2 text-[13px] font-medium">Refresh interval</p>
              <SegmentedControl
                value={String(interval)}
                onChange={(value) => setRefresh(Number(value))}
                options={INTERVALS.map((option) => ({
                  value: String(option.value),
                  label: option.label,
                }))}
              />
              <p className="mt-2 text-[11.5px] text-ink-subtle">
                Snapshot pulled {formatRelative(data?.generatedAt ?? now, now)}
              </p>
            </div>

            <Separator />

            <Row icon={<GaugeIcon size={16} />} label="Cadence hint" hint={BRAND.tagline}>
              <Badge tone="neutral" className="font-mono">
                {interval / 1000}s
              </Badge>
            </Row>
          </div>
        </SectionCard>

        <SectionCard title="Appearance" description="Density, theme and motion.">
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[13px] font-medium">Density</p>
              <SegmentedControl
                value={density}
                onChange={(value) => setDensity(value as Density)}
                options={[
                  { value: "comfortable", label: "Comfortable" },
                  { value: "compact", label: "Compact" },
                ]}
              />
            </div>

            <Separator />

            <div>
              <p className="mb-2 text-[13px] font-medium">Theme</p>
              <div className="flex items-center gap-2">
                {(["dark", "light"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTheme(option)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[12.5px] transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      mounted && theme === option
                        ? "border-brand/40 bg-brand/10 text-ink"
                        : "border-hairline text-ink-muted hover:bg-surface-2",
                    )}
                  >
                    {option === "dark" ? <MoonIcon size={14} /> : <SunIcon size={14} />}
                    {option}
                    {mounted && theme === option ? <CheckIcon size={12} weight="bold" /> : null}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            <Row icon={<PaintBrushIcon size={16} />} label="Reduce motion" hint="Disables parallax and float animations.">
              <Switch checked={reduceMotion} onCheckedChange={setReduceMotion} aria-label="Reduce motion" />
            </Row>
            <Row icon={<RowsIcon size={16} />} label="Sound cues" hint="Decorative toggle only. No sound is played anywhere in this console.">
              <Switch checked={sound} onCheckedChange={setSound} aria-label="Sound cues" />
            </Row>
            <Row icon={<ShieldCheckIcon size={16} />} label="Anonymous telemetry" hint="Decorative toggle only. Nothing is collected or sent.">
              <Switch checked={telemetry} onCheckedChange={setTelemetry} aria-label="Telemetry" />
            </Row>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Gateway wiring"
        description="The console reads from these endpoints. Without them it falls back to a deterministic simulated mesh."
        actions={
          <Button
            variant="subtle"
            size="sm"
            onClick={async () => {
              await copy(GATEWAY);
              toast.success("Gateway string copied");
            }}
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            Copy
          </Button>
        }
      >
        <div className="flex items-start gap-3 rounded-2xl border border-hairline bg-surface-2/50 p-3.5">
          <PlugsConnectedIcon size={16} className="mt-0.5 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              ANIM_GATEWAY_URLS
            </p>
            <p className="mt-1 break-all font-mono text-[12px] text-ink">{GATEWAY}</p>
            <p className="mt-2 text-[11.5px] text-ink-subtle">
              Comma-separated base URLs, one per profile. Set it in <span className="font-mono">.env.local</span>{" "}
              and restart <span className="font-mono">next dev</span>.
            </p>
          </div>
        </div>

        <Tabs defaultValue="profiles" className="mt-5">
          <TabsList>
            <TabsTrigger value="profiles">Profiles</TabsTrigger>
            <TabsTrigger value="links">Reporting lines</TabsTrigger>
            <TabsTrigger value="mcp">MCP tools</TabsTrigger>
          </TabsList>

          <TabsContent value="profiles">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PROFILES.map((profile) => {
                const live0 = data?.agents.find((agent) => agent.id === profile.id);
                return (
                  <li
                    key={profile.id}
                    className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-2/50 p-3"
                  >
                    <AgentGlyph
                      id={profile.id}
                      accent={live0?.accent ?? profile.accent}
                      size={28}
                      status={live0?.status ?? "offline"}
                      pulse={false}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{profile.id}</p>
                      <p className="truncate text-[11px] text-ink-subtle">
                        :{profile.port} · {profile.role}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-ink-subtle">
                      {live0 ? formatMs(live0.latencyMs) : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </TabsContent>

          <TabsContent value="links">
            {/* These are declared reporting lines from `agents/registry.json`.
                They are not measured A2A traffic: the host collector reads
                `a2a_agents` and keeps only a peer count, so the identities never
                reach this process. The table used to show a `strength` and a
                `latency` column, both derived from arithmetic on port numbers,
                under an "A2A links" heading that made them look measured. */}
            <p className="mb-2 text-[12px] leading-snug text-ink-subtle">
              Declared reporting lines from the registry. Measured A2A traffic is not collected
              yet, so none of this says how much anything is actually talking.
            </p>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                    <th className="py-2 pr-3">reports from</th>
                    <th className="py-2">reports to</th>
                  </tr>
                </thead>
                <tbody>
                  {hierarchy.map((link) => (
                    <tr key={`${link.source}-${link.target}`} className="border-t border-hairline">
                      <td className="py-1.5 pr-3 font-mono">{link.source}</td>
                      <td className="py-1.5 font-mono">{link.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="mcp">
            <div className="flex flex-wrap gap-2">
              {MCP_TOOLS.map((tool) => (
                <Badge key={tool} tone="brand" className="font-mono">
                  {tool}
                </Badge>
              ))}
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-ink-subtle">
              Tool names the simulated fallback attaches to agents. Live agents
              advertise their own skills on the agent card; nothing is audited
              per call, and no token cost is measured on the host.
            </p>
          </TabsContent>
        </Tabs>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Shortcuts"
          description="Global keys available on every page."
          actions={
            <TooltipRoot>
              <TooltipTrigger asChild>
                <div>
                  <Switch checked={hotkeys} onCheckedChange={setHotkeys} aria-label="Hotkeys" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">Enable global keyboard shortcuts</TooltipContent>
            </TooltipRoot>
          }
        >
          <div id="shortcuts">
            {!hotkeys ? (
              <Hint label="Shortcuts off">
                Re-enable the switch above to use the keys below.
              </Hint>
            ) : null}
            <ul className="mt-2 divide-y divide-hairline">
              {SHORTCUTS.map(([key, label]) => (
                <li key={key} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-[12.5px] text-ink-muted">{label}</span>
                  <Kbd>{key}</Kbd>
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Environment" description="What this build reads.">
          <dl className="space-y-3 text-[12.5px]">
            <Env label="vault path" value={VAULT_PATH} />
            <Env label="model" value={MODEL_DEFAULT} />
            <Env label="provider" value={PROVIDER} />
            <Env label="peers" value={String(PROFILES.length)} />
            <Env label="reporting lines" value={String(hierarchy.length)} />
            <Env label="brand" value={`${BRAND.name} v${BRAND.version}`} />
          </dl>
          <Button
            variant="subtle"
            size="sm"
            className="mt-5 w-full"
            onClick={() => void mutate()}
          >
            <ArrowsClockwiseIcon size={15} />
            Verify connectivity
          </Button>
        </SectionCard>
      </div>

      <SectionCard title="Advanced" description="Rarely needed, but here when you need it.">
        <Accordion type="single" collapsible>
          <AccordionItem value="cache">
            <AccordionTrigger>Reset local console state</AccordionTrigger>
            <AccordionContent>
              <p className="text-[12.5px] text-ink-muted">
                Clears the persisted theme, density and palette preferences from this browser only.
                Mesh data lives in the gateway and is untouched.
              </p>
              <Button
                variant="danger"
                size="sm"
                className="mt-3"
                onClick={() => {
                  resetConsolePreferences();
                  toast.success("Local preferences cleared", {
                    description: "Reload to pick up defaults.",
                  });
                }}
              >
                Clear preferences
              </Button>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="keyboard">
            <AccordionTrigger>Why the mesh is simulated</AccordionTrigger>
            <AccordionContent>
              <p className="text-[12.5px] leading-relaxed text-ink-muted">
                No gateway answered within the request budget, so the console serves a deterministic
                synthetic mesh derived from the same seven profiles. Telemetry, topology and task
                mutations all behave identically — only the source badge changes.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SectionCard>
    </div>
  );
}

function Row({
  icon,
  label,
  hint,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-ink-subtle">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-[11.5px] leading-snug text-ink-subtle">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Env({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="truncate font-mono text-[12px] text-ink">{value}</dd>
    </div>
  );
}
