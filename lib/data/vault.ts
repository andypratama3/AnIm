import type { Note } from "@/lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();

export const VAULT_FOLDERS = [
  "Projects",
  "Daily",
  "Research",
  "Memory-Review",
  "Skills-Notes",
  "Templates",
] as const;

export const SEED_NOTES: Note[] = [
  {
    id: "note-mesh-architecture",
    title: "Mesh architecture and delegation chain",
    path: "Projects/AnIm/mesh-architecture.md",
    folder: "Projects",
    updatedAt: now - 2 * HOUR,
    bytes: 4820,
    tags: ["anIm", "mesh", "a2a"],
    pinned: true,
    excerpt:
      "Every agent owns one port, one SOUL and one MCP surface. Delegation flows orchestrator → coordinator → executor.",
    body: `## Delegation chain

The orchestrator (\`default\`, port 9900) is the only entry point for inbound intent. It never executes work itself — it routes.

1. **default** — arbitrates, owns sign-off
2. **ceo-bor** — turns intent into a scoped brief
3. **principal-engineer** — sequences the work
4. **frontend / backend** — execute and report back
5. **social-media / management-research** — produce artefacts into the vault

## Rules that keep the mesh honest

- One SOUL per profile; the model is pinned per config so behaviour stays comparable.
- A2A handshakes carry a token per edge — \`max_depth = 2\`, \`concurrent = 3\`.
- Anything an agent learns lands in the vault before it is reported, so the next run inherits context.

> Free-tier inference is the binding constraint. Fan-out is staggered, never parallel, when the quota window is thin.`,
  },
  {
    id: "note-2026-09-26",
    title: "Daily 2026-09-26",
    path: "Daily/2026-09-26.md",
    folder: "Daily",
    updatedAt: now - 5 * HOUR,
    bytes: 2140,
    tags: ["daily", "log"],
    excerpt:
      "Backend gateway restarted after an OOM kill. Discord webhook backoff engaged. Quota window nearly spent.",
    body: `## What happened

- \`backend\` (9906) was SIGKILLed at 04:12 — suspected OOM. Restarted, health green since.
- Discord webhook hit a rate limit; backoff now exponential with jitter.
- Email IMAP probe timed out twice. Unrelated to the mesh, tracked separately.

## Tomorrow

- Confirm the memory ceiling for \`backend\` before the next fan-out.
- Ship the topology view so link hotspots are visible without reading logs.`,
  },
  {
    id: "note-quota",
    title: "OpenRouter free-tier budget",
    path: "Projects/AnIm/quota-budget.md",
    folder: "Projects",
    updatedAt: now - 1 * DAY,
    bytes: 1860,
    tags: ["cost", "reliability"],
    excerpt:
      "The free window resets hourly. Treat 402 as a scheduling signal, not a failure.",
    body: `## Reading the window

A \`402\` from \`thinkingmachines/inkling:free\` means the window is spent — not that the model is broken.

- Watchdog alerts at 10 requests remaining.
- Fan-out degrades to sequential.
- Cached results in the vault are served instead of re-querying.

Cost per full mesh sweep stays under a cent, which is why the mesh is safe to run continuously on the free tier.`,
  },
  {
    id: "note-competitors",
    title: "Agent mesh tooling landscape",
    path: "Research/agent-mesh-tooling.md",
    folder: "Research",
    updatedAt: now - 2 * DAY,
    bytes: 6340,
    tags: ["research", "market"],
    excerpt:
      "Most orchestration tooling hides topology. Operators want the graph, not another chat box.",
    body: `## Findings

Ten sources reviewed. Three themes repeat:

1. **Topology is the product.** Operators debug the graph, not the prompt.
2. **Delegation depth is a cost lever.** Deeper chains multiply spend faster than they multiply quality.
3. **Vault continuity beats context windows.** A durable note layer outperforms a longer prompt.

## Implication for AnIm

Lead with the live graph and the vault. Treat chat as secondary.`,
  },
  {
    id: "note-frontend-parity",
    title: "Interface parity checklist",
    path: "Skills-Notes/interface-parity.md",
    folder: "Skills-Notes",
    updatedAt: now - 3 * DAY,
    bytes: 3120,
    tags: ["frontend", "checklist"],
    excerpt:
      "Every view needs a loading state, an empty state, a keyboard path and a copyable identifier.",
    body: `## Parity rules

- Loading: skeletons that match final geometry, never a spinner over shifting layout.
- Empty: say what will appear and how to make it appear.
- Keyboard: every action reachable without a pointer.
- Identity: every agent id, port and task id is copyable in one click.

## Anti-patterns

- A grid of identical grey boxes.
- Numbers without units or a trend.
- A status chip that never changes state.`,
  },
  {
    id: "note-security",
    title: "Token hygiene",
    path: "Projects/AnIm/token-hygiene.md",
    folder: "Projects",
    updatedAt: now - 4 * DAY,
    bytes: 1420,
    tags: ["security"],
    excerpt: "Truncate secrets to twelve characters in any report that leaves the host.",
    body: `Never paste a full token into a note, a commit or a chat message.

- Report format: \`sk-or-v1-e82…\` — first twelve characters only.
- Rotate peer tokens on the documented cadence.
- Back up \`.env\` before every edit, and validate the YAML after.`,
  },
  {
    id: "note-agent-note",
    title: "Agent note template",
    path: "Templates/Agent-Note.md",
    folder: "Templates",
    updatedAt: now - 6 * DAY,
    bytes: 780,
    tags: ["template"],
    excerpt: "Reusable shape for any per-agent note: context, decisions, open threads.",
    body: `## Context

What this agent is responsible for right now.

## Decisions

- Shipped
- Reverted
- Deferred

## Open threads

Anything the next run must pick up.`,
  },
  {
    id: "note-memory-review",
    title: "Memory review 2026-09",
    path: "Memory-Review/2026-09.md",
    folder: "Memory-Review",
    updatedAt: now - 8 * DAY,
    bytes: 5240,
    tags: ["review"],
    excerpt: "What the mesh learned this month, and what it is still guessing at.",
    body: `## Learned

- Staggered fan-out is cheaper than parallel fan-out on the free tier.
- A topology view reduces delegation mistakes more than any prompt change.

## Still guessing

- Whether depth 2 is optimal for research tasks specifically.
- Whether the memory ceiling is a config issue or a workload issue.`,
  },
];
