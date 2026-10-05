"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { AgentDesk } from "@/components/dashboard/agent-desk";
import type { Agent } from "@/lib/types";

interface Department {
  name: string;
  members: Agent[];
}

interface OfficeCanvasProps {
  departments: Department[];
  workingAgents: Agent[];
  agentActivity: Map<string, { count: number; lastActivity: number }>;
  focusAgent: string | null;
  setFocusAgent: (id: string) => void;
}

interface ConnectionPoint {
  x: number;
  y: number;
}

export function OfficeCanvas({
  departments,
  workingAgents,
  agentActivity,
  focusAgent,
  setFocusAgent,
}: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [connectionPoints, setConnectionPoints] = useState<Map<string, ConnectionPoint>>(new Map());

  // Calculate connections between working agents
  const connections = useMemo(() => {
    const links: Array<{ from: Agent; to: Agent; type: "collaboration" | "reporting" }> = [];
    const working = workingAgents;
    
    // Simple logic: connect agents in same department or with similar load
    for (let i = 0; i < working.length; i++) {
      for (let j = i + 1; j < working.length; j++) {
        const agentA = working[i];
        const agentB = working[j];
        
        // Connect if they're in same department or both have high load
        const sameDept = getDepartment(agentA.role) === getDepartment(agentB.role);
        const bothBusy = (agentA.load ?? 0) > 50 && (agentB.load ?? 0) > 50;
        
        if (sameDept || bothBusy) {
          links.push({
            from: agentA,
            to: agentB,
            type: sameDept ? "collaboration" : "reporting",
          });
        }
      }
    }
    
    return links;
  }, [workingAgents]);

  // Update connection points after render
  useEffect(() => {
    const updatePoints = () => {
      const points = new Map<string, ConnectionPoint>();
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      workingAgents.forEach((agent) => {
        const el = document.getElementById(`desk-${agent.id}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          points.set(agent.id, {
            x: rect.left + rect.width / 2 - canvasRect.left,
            y: rect.top + rect.height / 2 - canvasRect.top,
          });
        }
      });
      setConnectionPoints(points);
    };

    // Delay to ensure DOM is updated
    const timeout = setTimeout(updatePoints, 100);
    window.addEventListener('resize', updatePoints);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', updatePoints);
    };
  }, [workingAgents, departments]);

  return (
    <div
      ref={canvasRef}
      className="relative min-h-[600px] w-full overflow-hidden rounded-2xl border border-hairline bg-gradient-to-br from-surface/30 to-surface/50 p-6"
    >
      {/* Office grid background */}
      <div className="absolute inset-0 opacity-5">
        <svg className="h-full w-full">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Connection lines */}
      <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        {connections.map((conn, index) => {
          const fromPoint = connectionPoints.get(conn.from.id);
          const toPoint = connectionPoints.get(conn.to.id);
          
          if (!fromPoint || !toPoint) return null;
          
          return (
            <motion.path
              key={`${conn.from.id}-${conn.to.id}`}
              d={`M ${fromPoint.x} ${fromPoint.y} Q ${(fromPoint.x + toPoint.x) / 2} ${(fromPoint.y + toPoint.y) / 2 - 50} ${toPoint.x} ${toPoint.y}`}
              fill="none"
              stroke={conn.type === "collaboration" ? "var(--brand)" : "var(--brand-2)"}
              strokeWidth="2"
              strokeDasharray={conn.type === "collaboration" ? "4 4" : "8 4"}
              opacity={0.4}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.4 }}
              transition={{ duration: 1, delay: index * 0.1 }}
            >
              <animate
                attributeName="stroke-dashoffset"
                from="100"
                to="0"
                dur="2s"
                repeatCount="indefinite"
              />
            </motion.path>
          );
        })}
      </svg>

      {/* Department sections */}
      <div className="relative space-y-8" style={{ zIndex: 2 }}>
        {departments.map((dept, deptIndex) => (
          <motion.div
            key={dept.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: deptIndex * 0.15, duration: 0.5 }}
          >
            <div className="mb-4 flex items-center gap-2">
              <div className="h-px flex-1 bg-hairline" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
                {dept.name}
              </span>
              <div className="h-px flex-1 bg-hairline" />
            </div>
            
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {dept.members.map((agent) => (
                <div key={agent.id} id={`desk-${agent.id}`}>
                  <AgentDesk
                    agent={agent}
                    activity={agentActivity.get(agent.id)}
                    isFocused={focusAgent === agent.id}
                    onClick={() => setFocusAgent(agent.id)}
                  />
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 rounded-xl border border-hairline bg-surface/80 p-3 text-[11px] backdrop-blur-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-1 w-8 rounded-full bg-brand" />
            <span className="text-ink-subtle">Collaboration</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1 w-8 rounded-full bg-brand-2" style={{ background: "var(--brand-2)" }} />
            <span className="text-ink-subtle">Reporting</span>
          </div>
        </div>
      </div>
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
