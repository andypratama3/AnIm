"use client";

import { useEffect, useState } from "react";
import { CpuIcon, LightningIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/dashboard/page-header";

type LiveAgent = {
  id: string;
  displayName: string;
  title: string | null;
  department: string | null;
  reportsTo: string | null;
  port: number | null;
  peers: number;
  gateway: string;
  a2aReachable: boolean;
  stateLabel: string;
  skillCount: number;
  skills: string[];
  docCount: number;
};

type LivePayload = {
  mode: "live";
  totals: { profiles: number; running: number; installed: number; reachable: number; withDocs: number; departments: number; meshLinksExpected: number };
  agents: LiveAgent[];
};

/**
 * Real skill roster per agent, read from the deployed registry through the
 * read-only bridge. When the bridge is down the panel says so rather than
 * inventing a plausible list.
 */
export function AgentSkillPanel({ agentId }: { agentId: string }) {
  const [data, setData] = useState<LivePayload | null>(null);
  const [state, setState] = useState<"loading" | "live" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/mesh-live", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as LivePayload;
        if (cancelled) return;
        setData(body);
        setState("live");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const agent = data?.agents.find((item) => item.id === agentId);

  return (
    <SectionCard title="Assigned skills" description="From the deployed registry on the Hermes host.">
      {state === "loading" ? (
        <div className="h-16 animate-pulse rounded-2xl bg-surface-2" />
      ) : state === "unavailable" || !agent ? (
        <p className="text-[12px] text-ink-subtle">
          Skill roster unavailable while the mesh bridge is offline.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">
              <LightningIcon size={11} weight="fill" />
              {agent.skillCount} skills
            </Badge>
            <Badge tone="neutral">{agent.peers} A2A peers</Badge>
            <Badge tone="neutral">{agent.docCount} docs</Badge>
            {agent.title ? <Badge tone="neutral">{agent.title}</Badge> : null}
          </div>
          {agent.skills.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {agent.skills.map((skill) => (
                <li key={skill}>
                  <Badge tone="neutral" size="sm">
                    {skill}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-ink-subtle">
              No skills listed in the registry for this profile.
            </p>
          )}
          <p className="flex items-start gap-1.5 text-[11px] text-ink-subtle">
            <CpuIcon size={12} className="mt-0.5 shrink-0" />
            <span>
              Reports to <span className="font-mono">{agent.reportsTo ?? "unassigned"}</span>
              {agent.department ? <> · {agent.department.replace(/-/g, " ")}</> : null}
            </span>
          </p>
        </div>
      )}
    </SectionCard>
  );
}
