"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwiseIcon, PlugsConnectedIcon, WarningIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge, Dot } from "@/components/ui/badge";
import { SectionCard } from "@/components/dashboard/page-header";
import { useConsole } from "@/components/providers/console-provider";
import { toast } from "sonner";

type LiveAgent = {
  id: string;
  displayName: string;
  title: string | null;
  department: string | null;
  port: number | null;
  peers: number;
  gateway: "running" | "installed" | "missing";
  a2aReachable: boolean;
  stateLabel: string;
  docCount: number;
  skillCount: number;
};

type LivePayload = {
  mode: "live";
  host: string;
  vaultPath: string;
  vaultDocs: number;
  collectMs: number;
  latencyMs: number;
  totals: { profiles: number; running: number; installed: number; reachable: number; withDocs: number; departments: number; meshLinksExpected: number };
  agents: LiveAgent[];
};

type LiveState =
  | { status: "loading" }
  | { status: "live"; data: LivePayload }
  | { status: "unavailable"; reason: string };

/**
 * Live constellation panel.
 *
 * Reads the real Hermes host over the read-only SSH bridge. If the bridge is
 * unreachable the panel states that plainly instead of rendering a plausible
 * looking placeholder, so nobody mistakes a network failure for a healthy mesh.
 */
export function LiveConstellationPanel() {
  const { setFocusAgent } = useConsole();
  const [state, setState] = useState<LiveState>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);

  const load = useCallback(async (notify: boolean) => {
    setPending(true);
    try {
      const response = await fetch("/api/mesh-live", { cache: "no-store" });
      const body = (await response.json()) as LivePayload & { mode: string; reason?: string };
      if (response.ok && body.mode === "live") {
        setState({ status: "live", data: body as LivePayload });
        setLastSync(Date.now());
        if (notify) {
          toast.success("Constellation pulled", {
            description: `${(body as LivePayload).totals.running}/${(body as LivePayload).totals.profiles} gateways live · ${(body as LivePayload).latencyMs}ms`,
          });
        }
      } else {
        setState({ status: "unavailable", reason: body.reason ?? `HTTP ${response.status}` });
        if (notify) toast.error("Bridge unavailable", { description: body.reason });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "network failure";
      setState({ status: "unavailable", reason });
      if (notify) toast.error("Bridge unavailable", { description: reason });
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the effect body itself performs no synchronous setState.
    const kick = window.setTimeout(() => void load(false), 0);
    // 15s matches the bridge cost (~0.5s collect) without hammering the host.
    const id = window.setInterval(() => void load(false), 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Drives the "synced Ns ago" label. `now` is mirrored into state because
  // Date.now() is impure and illegal to call during render.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <SectionCard
      title="Live constellation"
      description="Read straight from the Hermes host. Gateway state, A2A reachability and document coverage, no simulated numbers."
      actions={
        <Button variant="ghost" size="xs" onClick={() => void load(true)} disabled={pending}>
          <ArrowsClockwiseIcon size={13} className={pending ? "animate-spin" : undefined} />
          {pending ? "reading" : "refresh"}
          <Badge tone="ok" className="ml-1 font-mono text-[10px]">
            <Dot tone="ok" pulse />{" "}
            {lastSync === null || now === null
              ? "syncing"
              : `live · ${Math.max(0, Math.round((now - lastSync) / 1000))}s ago`}
          </Badge>
        </Button>
      }
    >
      {state.status === "loading" ? (
        <div className="space-y-2">
          <div className="h-16 animate-pulse rounded-2xl bg-surface-2" />
          <div className="h-16 animate-pulse rounded-2xl bg-surface-2" />
        </div>
      ) : state.status === "unavailable" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/5 p-4">
          <WarningIcon size={18} className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">Mesh bridge unavailable</p>
            <p className="mt-1 text-[12px] text-ink-subtle">
              {state.reason}. Set <code className="font-mono">ANIM_SSH</code> to enable the read-only bridge,
              or check key access to the host.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ok">
              <Dot tone="var(--ok)" pulse />
              {state.data.totals.running} gateways live
            </Badge>
            <Badge tone="brand">
              <PlugsConnectedIcon size={12} />
              {state.data.totals.reachable} A2A reachable
            </Badge>
            <Badge tone="neutral">{state.data.totals.installed} installed, stopped</Badge>
            <Badge tone="neutral">
              {state.data.totals.withDocs}/{state.data.totals.profiles} documented
            </Badge>
            <Badge tone="neutral">{state.data.totals.departments} departments</Badge>
            <Badge tone="neutral">
              {state.data.totals.meshLinksExpected} mesh pairs
            </Badge>
            <span className="font-mono text-[11px] text-ink-subtle">
              ssh {state.data.latencyMs}ms · collect {state.data.collectMs}ms
            </span>
          </div>

          <div className="grid grid-cols-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {state.data.agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setFocusAgent(agent.id)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface/60 px-3 py-2.5 text-left transition-colors hover:border-brand/40 hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <Dot tone={agent.gateway === "running" ? "var(--ok)" : "var(--ink-subtle)"} pulse={agent.gateway === "running"} />
                    <span className="truncate font-mono text-[12px] text-ink">{agent.id}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-subtle">
                    {agent.title ?? agent.displayName}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[11px] text-ink-muted">
                    {agent.port ?? "—"}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-ink-subtle">
                    {agent.a2aReachable ? "A2A live" : agent.stateLabel}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <p className="text-[11px] text-ink-subtle">
            Vault <code className="font-mono">{state.data.vaultPath}</code> holds {state.data.vaultDocs} markdown{" "}
            {state.data.vaultDocs === 1 ? "file" : "files"}. Read-only bridge: no token, key or file body is ever
            returned.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
