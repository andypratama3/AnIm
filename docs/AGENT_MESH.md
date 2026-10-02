# Agent Mesh — Specification

Twenty-six profiles in five departments, one orchestrator, one vault, one
console. This document is the source of truth for identity, routing, A2A and
chat requirements.

The authoritative roster is `agents/registry.json` (version 1.0.0), and the
console reads that file for ports and hierarchy — never a copy of a port table
in code, which drifted once already (`frontend` was probed on 9907 while the
registry said 9905; `tests/registry-ports.test.mjs` now fails if that returns).

## Scale: 26 profiles, 7 gateways running, 26 ports assigned

| | count | meaning |
|---|---|---|
| `state: "existing"` | 7 | profile present, gateway listening |
| `state: "new"` | 19 | profile defined, config + token wired, gateway not started |

All 26 registry entries carry an assigned port (**9900–9925**), matching
`/home/bor/.hermes/registry.json`. The 7 running gateways (**9900–9906**)
report `running`; the 19 without a listener report `installed` and the console
renders them as stopped-but-wired, never as missing. Starting those 19
gateways is a host capacity decision, not a console change — see
`docs/SERVER-DEFERRED.md`. A2A ports on this host are the only assigned ones:
verify against the registry before probing anything.

A stopped gateway does not make a profile unusable: `hermes -p <profile>` can
address a profile whose gateway is not listening.

## Departments

| id | chief | profiles |
|---|---|---|
| `office-of-owner` | `agent-secretary` | `default`, `ceo-bor`, `management-research`, `career-agent` |
| `engineering` | `principal-engineer` | `frontend`, `backend`, `fullstack-engineer`, `ai-engineer`, `devops-engineer`, `security-engineer`, `code-reviewer`, `hermes-operator` |
| `product-operations` | `agent-operasi-produk` | `qa-engineer`, `dashboard-engineer`, `automation-engineer` |
| `knowledge-content` | `knowledge-agent` | `social-media`, `content-strategist`, `technical-writer` |
| `commercial-finance` | `agent-pemasaran` | `agent-penjualan`, `agent-layanan`, `agent-keuangan` |

Ranks in the registry: one `orchestrator`, eight `chief`, seventeen `engineer`.
Every agent except `default` has a `reports_to`, and the console draws those
declared lines as a reporting hierarchy — labelled "reporting lines", never
"links", because `readHierarchy()` reads the committed registry rather than live
A2A edges (`docs/SERVER-DEFERRED.md`).

## Core topology (the seven with gateways)

```
                       ┌──────────────┐
                       │   default    │  :9900  CEO Bor — orchestrator
                       │  (Andy)      │  never writes code
                       └──────┬───────┘
                              │ A2A
                 ┌────────────┼─────────────┬──────────────┐
                 ▼            ▼             ▼              ▼
        ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────────┐
        │  ceo-bor    │ │ social-media │ │ mgmt-resrch│ │ principal-engineer│
        │   :9901     │ │    :9903     │ │   :9904    │ │      :9902       │
        │ coordinator │ │   content    │ │  research  │ │     executor     │
        └──────┬──────┘ └──────────────┘ └────────────┘ └────────┬─────────┘
               │                                                  │ A2A
               │                        ┌─────────────────────────┴────────┐
               └───────────────────────►│ frontend :9905   backend :9906  │
                                        └──────────────────────────────────┘
```

Every arrow is bidirectional. Each agent **receives** A2A on its own port and
**sends** A2A to all six peers. Peer lists are symmetric by construction.

## The seven with gateways

| id | port | role | delegates to | must not |
|---|---|---|---|---|
| `default` | 9900 | Orchestrator / CEO Bor | ceo-bor, social-media, management-research | write code |
| `ceo-bor` | 9901 | Engineering coordinator | principal-engineer | execute code itself |
| `principal-engineer` | 9902 | Senior engineering executor | frontend, backend | speculate |
| `social-media` | 9903 | Content strategist | — (receives briefs) | publish without approval |
| `management-research` | 9904 | Research analyst | — (feeds content) | present inference as fact |
| `frontend` | 9905 | Frontend executor | — | delegate further |
| `backend` | 9906 | Backend executor | — | delegate further |

## Required capabilities per agent

Each profile must satisfy all of these. A profile missing any one is a defect.

1. **A2A inbound.** Gateway listens on its port, `POST /` accepts JSON-RPC
   `message/send`, and the bearer token from the caller's `A2A_PEER_TOKENS`
   authenticates it. `GET /.well-known/agent.json` must advertise the a2a skill.
2. **A2A outbound.** The profile's `a2a_agents` block lists all six peers with a
   non-empty token, so it can address any node.
3. **Chat.** The profile is addressable by the console, which runs
   `hermes -p <id> -z <prompt>` (`lib/data/agent-chat.ts`): one process per turn,
   with prior turns re-supplied as context from the server's own transcript. The
   profile answers on its own channel.
4. **Vault.** MCP `obsidian` is wired with
   `OBSIDIAN_VAULT_PATH=/home/bor/Documents/Obsidian/Hermes-Agent` and
   `OBSIDIAN_MCP_TOOL_SETS=notes_write,vault_analysis`.
5. **Doc set.** Every profile carries the six files below, and they are internally
   consistent with each other and with `config.yaml`.

## The six-file doc set

Every profile, including `default`, carries:

| file | purpose |
|---|---|
| `SOUL.md` | Identity, role, workflow, tools, rules, reporting contract |
| `AGENTS.md` | Peer map, routing table, handoff contract, escalation path |
| `IDENTITY.md` | Canonical name, role, port, model, provider, gateway |
| `TOOLS.md` | Tool inventory, when to use each, what is forbidden |
| `USER.md` | Who the operator is, preferences, approval boundaries |
| `HEARTBEAT.md` | Periodic duties, self-check, degraded-state recovery |

Consistency rules:

- Ports, model ids and peer names must match `config.yaml` exactly, and a port in
  `config.yaml` must match `agents/registry.json`. The registry is what the
  console probes; the config is what the gateway binds.
- A peer named in `AGENTS.md` must exist in the registry.
- Anything an agent must never do appears in both `SOUL.md` and `TOOLS.md`.
- The vault path in every file is the real absolute path — never a `NAME`
  placeholder. (The previous `frontend/SOUL.md` shipped
  `/home/bor/.hermes/profiles/NAME/obsidian/...`, which resolved to nothing.)

## Delegation policy

- `max_spawn_depth: 2`, `max_concurrent_children: 3`, `max_spawns_per_turn: 10`.
- Chain of command is never bypassed: `default → ceo-bor → principal-engineer → {frontend, backend}`.
- Content chain: `management-research → social-media`, approval from `default`.
- A failed sub-agent is reported exactly as it failed, then the caller decides:
  retry, escalate, or abort. Silent retries are a defect.

## Owner acceptance policy

From `agents/registry.json`, and enforced by the review queue in `/discussion`:

- `owner_receives`: `VERIFIED` only. Andy never receives raw work.
- An agent must verify its own work with a second agent before reporting
  `VERIFIED`, and attach raw tool output, file paths and diffs as evidence.
- `BLOCKED` / `UNVERIFIED` / `FAILED` must be stated honestly rather than guessed.

The console **declares** who acted on a transition rather than proving it: one
shared token means the server cannot tell two people apart, so `transition()`
validates the name against this registry and stores `attribution: "declared"`.
The toast says so. See `docs/DASHBOARD.md`.

## Vault

`/home/bor/Documents/Obsidian/Hermes-Agent`

```
Projects/        one note per active project, YAML frontmatter
Daily/           dated run summaries written by the orchestrator
Research/        sourced research from management-research
Memory-Review/   candidate memories awaiting promotion
Skills-Notes/    human explanations for installed skills
Templates/       note templates (Agent-Note.md)
Agents/          one folder per agent for self-improvement notes
```

Every note carries YAML frontmatter and uses `[[wiki-links]]`. No secrets, ever.

**`/notes` in the console reads the real vault.** `/api/notes` lists
`/home/bor/Documents/Obsidian/Hermes-Agent` read-only via `lib/data/hermes-vault.ts`
and serves a body only for a path from that live listing. When the vault is
unreachable the notes array is empty and the response says why.

## Remote layout

```
/home/bor/.hermes/
├── SOUL.md                 orchestrator doc set
├── constitution.md         one section per agent
├── registry.json           the canonical roster the collector reads
├── config.yaml             model, ports, a2a_agents, delegation, mcp
├── mesh-inventory.py       the read-only collector
├── .env                    credentials — never read by the dashboard
└── profiles/<id>/
    ├── SOUL.md  AGENTS.md  IDENTITY.md  TOOLS.md  USER.md  HEARTBEAT.md
    ├── config.yaml
    └── obsidian/self-improvement.md
```

The console is deployed separately, at `/opt/anim-dashboard` on the same host,
with its own git checkout and `.env.local`. The two trees are not nested.

## Change safety

Every remote write is preceded by a backup:

```
/home/bor/.hermes.backup-anim-<YYYYMMDD-HHMMSS>/
```

**Never build, install, or restart services on the server.** See rule 1 in
`AGENTS.md`. Writing markdown is a content change and is allowed; deploying is
not. A finding that needs a server-side build or a gateway restart goes into
`docs/SERVER-DEFERRED.md` instead of being acted on.
