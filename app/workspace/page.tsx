"use client";

import { useMemo, useState } from "react";
import { useMesh } from "@/lib/hooks/use-data";
import { useConsole } from "@/components/providers/console-provider";
import { useActivity } from "@/lib/hooks/use-data";
import { PageHeader, SectionCard } from "@/components/dashboard/page-header";
import { Badge, Dot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPercent } from "@/lib/format";
import { ArrowClockwiseIcon, UsersIcon, GraphIcon } from "@phosphor-icons/react";
import { OfficeCanvas } from "@/components/dashboard/office-canvas";
import { AgentDesk } from "@/components/dashboard/agent-desk";
import type { Agent } from "@/lib/types";

export default function WorkspacePage() {
  const { data, isLoading, mutate } = useMesh();
  const { setFocusAgent, focusAgent } = useConsole();
  const { data: activityData } = useActivity({});
  const [viewMode, setViewMode] = useState<"office" | "list">("office");

  const agents = useMemo(() => data?.agents ?? [], [data]);
  const recentEvents = useMemo(() => activityData?.events ?? [], [activityData]);

  // Group agents by role/dept for office layout
  const departments = useMemo(() => {
    const groups = new Map<string, Agent[]>();
    agents.forEach((agent) => {
      const dept = getDepartment(agent.role);
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept)!.push(agent);
    });
    return Array.from(groups.entries()).map(([name, members]) => ({ name, members }));
  }, [agents]);

  // Filter agents by status
  const filteredAgents = agents;

  // Get working agents (busy status)
  const workingAgents = useMemo(() => agents.filter((agent) => agent.status === "busy"), [agents]);

  // Agent activity tracking from events
  const agentActivity = useMemo(() => {
    const activity = new Map<string, { count: number; lastActivity: number }>();
    recentEvents.slice(0, 50).forEach((event) => {
      const current = activity.get(event.agent) || { count: 0, lastActivity: 0 };
      activity.set(event.agent, {
        count: current.count + 1,
        lastActivity: Math.max(current.lastActivity, event.ts),
      });
    });
    return activity;
  }, [recentEvents]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Office View"
        description="Real-time visualization of your agent workforce. See who's working, who's connected, and how tasks flow through the organization."
        meta={
          <>
            <Badge tone="ok">
              <Dot tone="var(--ok)" pulse />
              {data?.totals.online ?? 0} online
            </Badge>
            <Badge tone="brand">{workingAgents.length} working</Badge>
            <Badge tone="neutral">{departments.length} departments</Badge>
          </>
        }
        actions={
          <>
            <Button variant="glass" size="sm" onClick={() => setViewMode(viewMode === "office" ? "list" : "office")}>
              {viewMode === "office" ? <UsersIcon size={15} /> : <GraphIcon size={15} />}
              {viewMode === "office" ? "List View" : "Office View"}
            </Button>
            <Button variant="primary" size="sm" onClick={() => void mutate()}>
              <ArrowClockwiseIcon size={15} className={isLoading ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </>
        }
      />

      <SectionCard
        title="Agent Workforce"
        description="Click any desk to inspect the agent. Glowing desks indicate active work."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="neutral" size="sm">All: {agents.length}</Badge>
            <Badge tone="ok" size="sm">Online: {data?.totals.online ?? 0}</Badge>
            <Badge tone="brand" size="sm">Busy: {workingAgents.length}</Badge>
            <Badge tone="warn" size="sm">Degraded: {data?.totals.degraded ?? 0}</Badge>
            <Badge tone="danger" size="sm">Offline: {data?.totals.offline ?? 0}</Badge>
          </div>
        }
      >
        {viewMode === "office" ? (
          <OfficeCanvas
            departments={departments}
            workingAgents={workingAgents}
            agentActivity={agentActivity}
            focusAgent={focusAgent}
            setFocusAgent={setFocusAgent}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredAgents.map((agent) => (
              <AgentDesk
                key={agent.id}
                agent={agent}
                activity={agentActivity.get(agent.id)}
                isFocused={focusAgent === agent.id}
                onClick={() => setFocusAgent(agent.id)}
                compact
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Department Overview" description="Team distribution and workload.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => {
            const deptWorking = dept.members.filter((a) => a.status === "busy").length;
            const deptOnline = dept.members.filter((a) => a.status !== "offline").length;
            const avgLoad = dept.members.reduce((sum, a) => sum + (a.load ?? 0), 0) / dept.members.length;

            return (
              <div
                key={dept.name}
                className="rounded-2xl border border-hairline bg-surface-2/50 p-4 transition-all duration-500 hover:border-brand/30 hover:bg-surface-2 hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[14px] font-semibold">{dept.name}</h3>
                  <Badge tone="neutral" size="sm">{dept.members.length} agents</Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-subtle">Working</span>
                    <span className="font-mono text-brand">{deptWorking}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-subtle">Online</span>
                    <span className="font-mono text-ok">{deptOnline}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-subtle">Avg Load</span>
                    <span className="font-mono">{formatPercent(avgLoad, 0)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function getDepartment(role: string): string {
  const roleLower = role.toLowerCase();
  if (roleLower.includes("orchestrator") || roleLower.includes("coordinator")) return "Leadership";
  if (roleLower.includes("engineer") || roleLower.includes("backend") || roleLower.includes("frontend")) return "Engineering";
  if (roleLower.includes("content") || roleLower.includes("social")) return "Content Studio";
  if (roleLower.includes("research")) return "Research";
  if (roleLower.includes("executor")) return "Execution";
  return "General";
}
