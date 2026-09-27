"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  XIcon,
  CopyIcon,
  CheckIcon,
  PaperPlaneTiltIcon,
  CpuIcon,
  DatabaseIcon,
  ShareNetworkIcon,
  TimerIcon,
  StackIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useConsole } from "@/components/providers/console-provider";
import { useMesh } from "@/lib/hooks/use-data";
import { useCopyToClipboard } from "@/lib/hooks/use-ui";
import { NOT_MEASURED, formatCompact, formatDuration, formatMs, formatNumber, formatPercent, formatRelative, formatPort, describePort, describeModel } from "@/lib/format";
import { Sheet, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, Dot, Meter } from "@/components/ui/badge";
import { AgentGlyph, STATUS_COLOR } from "@/components/dashboard/agent-glyph";
import { AgentSkillPanel } from "@/components/dashboard/agent-skill-panel";
import { Sparkline } from "@/components/dashboard/sparkline";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { writeJson } from "@/lib/api/write";

export function AgentDrawer() {
  const { focusAgent, setFocusAgent } = useConsole();
  const { data } = useMesh();
  const [copied, copy] = useCopyToClipboard();
  const [busy, setBusy] = useState<string | null>(null);

  const agent = data?.agents.find((item) => item.id === focusAgent);

  /**
   * Ping now measures a real round trip through /api/agent-probe. The previous
   * implementation slept 620ms and printed a latency the page already had, which
   * made a dead peer look responsive.
   */
  const ping = async () => {
    if (!agent || busy) return;
    setBusy("ping");
    try {
      const response = await writeJson("/api/agent-probe", {
        json: { profile: agent.id },
      });
      if (response.status === 401) {
        // The shared session state has already flipped, so the sign-in card is
        // on screen; this only explains what happened to the click.
        toast.error("Sign in required", { description: "sign in to probe agents" });
        return;
      }
      const body = (await response.json()) as {
        tcpConnected?: boolean;
        connectMs?: number | null;
        a2aStatus?: number | null;
        a2aMs?: number | null;
        error?: string | null;
      };
      if (body.tcpConnected) {
        const rtt = body.a2aMs ?? body.connectMs;
        toast.success(`${agent.id} answered`, {
          description: `${body.a2aStatus ?? "no status"} on ${describePort(agent.port)}${
            rtt != null ? ` · ${rtt}ms` : ""
          }`,
        });
      } else {
        toast.error(`${agent.id} unreachable`, {
          description: `no TCP accept on ${describePort(agent.port)}${body.error ? ` (${body.error})` : ""}`,
        });
      }
    } catch {
      toast.error("Probe failed", { description: "could not reach the bridge" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={Boolean(focusAgent)} onOpenChange={(open) => !open && setFocusAgent(null)}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {agent ? (
          <div className="flex h-full flex-col">
            <div className="flex items-start gap-3 border-b border-hairline px-5 py-5">
              <AgentGlyph id={agent.id} accent={agent.accent} size={46} status={agent.status} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em]">{agent.id}</h2>
                  <Badge tone={agent.status === "online" ? "ok" : agent.status === "busy" ? "brand" : agent.status === "degraded" ? "warn" : "danger"}>
                    <Dot tone={STATUS_COLOR[agent.status]} pulse={agent.status !== "offline"} />
                    {agent.status}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-subtle">
                  {agent.role} · <span className="font-mono">{formatPort(agent.port)}</span> ·{" "}
                  {formatRelative(agent.lastSeen, data?.generatedAt)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => setFocusAgent(null)}
                aria-label="Close panel"
              >
                <XIcon size={16} weight="bold" />
              </Button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <p className="text-[13px] leading-relaxed text-ink-muted">{agent.summary}</p>

              <div className="grid grid-cols-2 gap-3">
                <Metric label="Health" value={formatPercent(agent.health, 0)} tone={STATUS_COLOR[agent.status]} />
                <Metric label="Latency" value={formatMs(agent.latencyMs)} />
                <Metric label="Load" value={formatPercent(agent.load, 0)} />
                <Metric label="Uptime" value={formatPercent(agent.uptimePct, 2)} />
                <Metric label="Queue" value={formatNumber(agent.queue)} />
                <Metric label="Memory" value={agent.memoryMb == null ? NOT_MEASURED : `${agent.memoryMb} MB`} />
              </div>

              <div className="rounded-2xl border border-hairline bg-surface-2/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                    Throughput
                  </span>
                  <span className="font-mono text-[11px] text-ink-subtle">
                    {agent.throughput.at(-1)?.toFixed(1)} rps
                  </span>
                </div>
                <Sparkline data={agent.throughput} tone={STATUS_COLOR[agent.status]} height={54} />
              </div>

              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-ink-muted">Capacity used</span>
                    <span className="font-mono text-ink">{formatPercent(agent.load, 0)}</span>
                  </div>
                  {agent.load == null ? (
                    <p className="text-[11px] text-ink-subtle">Capacity is not reported by the mesh collector.</p>
                  ) : (
                    <Meter value={agent.load} tone={STATUS_COLOR[agent.status]} />
                  )}
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-ink-muted">Health score</span>
                    <span className="font-mono text-ink">
                      {agent.health == null ? NOT_MEASURED : agent.health.toFixed(1)}
                    </span>
                  </div>
                  {/* No meter without a measurement: a bar at 0% and a bar at 50%
                      are equally invented, so an unmeasured score draws nothing. */}
                  {agent.health == null ? (
                    <p className="text-[11px] text-ink-subtle">Not reported by the collector.</p>
                  ) : (
                    <Meter value={agent.health} tone="var(--ok)" />
                  )}
                </div>
              </div>

              <AgentSkillPanel agentId={agent.id} />

              <div className="rounded-2xl border border-hairline bg-surface-2/60 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                  Wiring
                </p>
                <dl className="space-y-2.5 text-[12px]">
                  <Row icon={<CpuIcon size={14} />} label="Model" value={describeModel(agent.model)} mono />
                  <Row icon={<DatabaseIcon size={14} />} label="Provider" value={describeModel(agent.provider)} />
                  <Row icon={<ShareNetworkIcon size={14} />} label="A2A peers" value={`${agent.peers} connected`} />
                  <Row icon={<StackIcon size={14} />} label="Tokens" value={formatCompact(agent.tokens)} />
                  <Row
                    icon={<TimerIcon size={14} />}
                    label="Avg turn"
                    value={formatDuration(agent.latencyMs == null ? null : agent.latencyMs * 3)}
                  />
                </dl>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {agent.mcp.map((tool) => (
                    <Badge key={tool} tone="neutral" size="sm">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>

              {agent.status === "degraded" || agent.status === "offline" ? (
                <div className="flex items-start gap-2.5 rounded-2xl border border-warn/25 bg-warn/8 p-3.5 text-[12px] text-warn">
                  <WarningIcon size={15} weight="fill" className="mt-0.5 shrink-0" />
                  <span>
                    This peer is {agent.status}. Latency is inflated and downstream delegation may
                    stall. Restart it or reroute traffic to the orchestrator.
                  </span>
                </div>
              ) : null}
            </div>

            <div className="grid gap-2 border-t border-hairline px-5 py-4 sm:grid-cols-2">
              <Button variant="primary" onClick={() => void ping()} disabled={busy !== null}>
                <PaperPlaneTiltIcon size={15} weight="fill" className={cn(busy === "ping" && "animate-pulse")} />
                {busy === "ping" ? "Measuring…" : "Measure round trip"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void copy(`${agent.id} · ${describePort(agent.port)} · ${describeModel(agent.model)}`);
                  toast.success("Peer identity copied");
                }}
              >
                {copied ? <CheckIcon size={15} className="text-ok" /> : <CopyIcon size={15} />}
                Copy id
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center p-8 text-center text-[13px] text-ink-subtle">
            Select a peer to inspect it.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      className="rounded-2xl border border-hairline bg-surface-2/50 p-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{label}</p>
      <p className="mt-1 font-mono text-[15px] font-medium" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </motion.div>
  );
}

function Row({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-ink-subtle">{icon}</span>
      <dt className="text-ink-subtle">{label}</dt>
      <dd className={cn("ml-auto truncate text-ink", mono && "font-mono text-[11px]")}>{value}</dd>
    </div>
  );
}
