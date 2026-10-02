import type { Agent } from "@/lib/types";

export const MODEL_DEFAULT = "oc/muse-spark-1.3-contributor-free";
export const PROVIDER = "9router";
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
  {
    id: "agent-secretary",
    role: "Owner Office",
    port: 9907,
    accent: "brand-2",
    summary: "Be the only channel to Andy. Triage everything, decide what deserves his attention, and never let unverified work reach him.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "agent-operasi-produk",
    role: "Product & Ops",
    port: 9908,
    accent: "info",
    summary: "Keep ProductSchool and AndyOS functioning to a real production standard, verified continuously.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "fullstack-engineer",
    role: "Engineering",
    port: 9909,
    accent: "warn",
    summary: "Deliver end-to-end features across Laravel and Next.js with tests and evidence.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "ai-engineer",
    role: "Engineering",
    port: 9910,
    accent: "brand-3",
    summary: "Make agent behaviour reliable: prompts, routing, tool use, evaluation, and cost control.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "devops-engineer",
    role: "Engineering",
    port: 9911,
    accent: "info",
    summary: "Keep runtime healthy, deployable, and observable without ever leaking a secret.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "security-engineer",
    role: "Engineering",
    port: 9912,
    accent: "ok",
    summary: "Find the hole before an attacker does, and prove the fix with evidence.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "qa-engineer",
    role: "Product & Ops",
    port: 9913,
    accent: "warn",
    summary: "Be the independent verifier. Nothing reaches Andy on a self-report alone.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "code-reviewer",
    role: "Engineering",
    port: 9914,
    accent: "brand",
    summary: "Second pair of eyes with teeth. Approve only what survives scrutiny.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "hermes-operator",
    role: "Engineering",
    port: 9915,
    accent: "brand-2",
    summary: "Operate the mesh itself: profiles, gateways, A2A wiring, and skill authoring.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "dashboard-engineer",
    role: "Product & Ops",
    port: 9916,
    accent: "brand-3",
    summary: "Make the AnIm dashboard the owner control room: live agents, live chat, real task state.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "automation-engineer",
    role: "Product & Ops",
    port: 9917,
    accent: "info",
    summary: "Remove manual work safely. Every automation has a guard and an undo.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "knowledge-agent",
    role: "Knowledge",
    port: 9918,
    accent: "ok",
    summary: "Own the company knowledge base: accurate, searchable, and cited.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "content-strategist",
    role: "Knowledge",
    port: 9919,
    accent: "warn",
    summary: "Plan content that is technically true, useful, and never padded with generic filler.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "technical-writer",
    role: "Knowledge",
    port: 9920,
    accent: "brand",
    summary: "Write documentation that is correct the first time a reader depends on it.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "agent-pemasaran",
    role: "Commercial",
    port: 9921,
    accent: "brand-3",
    summary: "Build a credible professional presence with consistent distribution.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "agent-penjualan",
    role: "Commercial",
    port: 9922,
    accent: "info",
    summary: "Convert interest into real revenue through verified, honest proposals.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "agent-layanan",
    role: "Commercial",
    port: 9923,
    accent: "ok",
    summary: "Make sure no important customer or admin message is ever missed.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "agent-keuangan",
    role: "Commercial",
    port: 9924,
    accent: "warn",
    summary: "Keep the numbers honest and the administration compliant.",
    baseHealth: 80,
    baseLoad: 50,
  },
  {
    id: "career-agent",
    role: "Owner Office",
    port: 9925,
    accent: "brand",
    summary: "Keep professional trajectory deliberate, with real market evidence.",
    baseHealth: 80,
    baseLoad: 50,
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
