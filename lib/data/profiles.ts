import type { Agent } from "@/lib/types";

export const MODEL_DEFAULT = "thinkingmachines/inkling:free";
export const PROVIDER = "openrouter";
export const MCP_TOOLS = ["notes_write", "vault_analysis", "a2a_call", "spawn_task"] as const;

export const VAULT_PATH = "~/Documents/Obsidian/Hermes-Agent";

export type ProfileDef = {
  id: string;
  role: string;
  port: number;
  accent: string;
  summary: string;
  baseHealth: number;
  baseLoad: number;
};

export const PROFILES: ProfileDef[] = [
  {
    id: "default",
    role: "Orchestrator",
    port: 9900,
    accent: "brand",
    summary: "Routes inbound intent, arbitrates the mesh and owns delivery sign-off.",
    baseHealth: 97,
    baseLoad: 62,
  },
  {
    id: "ceo-bor",
    role: "Coordinator",
    port: 9901,
    accent: "brand-3",
    summary: "Turns operator goals into scoped briefs and keeps stakeholders aligned.",
    baseHealth: 94,
    baseLoad: 48,
  },
  {
    id: "principal-engineer",
    role: "Executor",
    port: 9902,
    accent: "info",
    summary: "Decomposes engineering work and sequences backend/frontend execution.",
    baseHealth: 91,
    baseLoad: 74,
  },
  {
    id: "social-media",
    role: "Content Studio",
    port: 9903,
    accent: "brand-2",
    summary: "Drafts, scores and schedules multi-channel content from the vault.",
    baseHealth: 88,
    baseLoad: 55,
  },
  {
    id: "management-research",
    role: "Research Desk",
    port: 9904,
    accent: "ok",
    summary: "Gathers external signal, distils briefs and stress-tests assumptions.",
    baseHealth: 93,
    baseLoad: 39,
  },
  {
    id: "frontend",
    role: "Interface Execution",
    port: 9905,
    accent: "brand-2",
    summary: "Ships UI surfaces, audits design parity and verifies accessibility.",
    baseHealth: 86,
    baseLoad: 68,
  },
  {
    id: "backend",
    role: "Service Execution",
    port: 9906,
    accent: "warn",
    summary: "Owns gateways, A2A transport, persistence and deployment rollouts.",
    baseHealth: 79,
    baseLoad: 81,
  },
];

export const STATUS_TONE = {
  online: { label: "Online", color: "var(--ok)", ring: "ok" },
  busy: { label: "Busy", color: "var(--brand)", ring: "brand" },
  degraded: { label: "Degraded", color: "var(--warn)", ring: "warn" },
  offline: { label: "Offline", color: "var(--danger)", ring: "danger" },
} as const;

export const AGENT_BLURB: Record<string, string> = Object.fromEntries(
  PROFILES.map((p) => [p.id, p.summary]),
);

export type { Agent };
