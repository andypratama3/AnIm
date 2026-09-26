# Agent Mesh — Specification

Seven agents, one orchestrator, one vault, one console. This document is the
source of truth for identity, routing, A2A and chat requirements.

## Topology

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

## The seven agents

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
3. **Chat.** The profile is reachable as a chat agent: `hermes -p <id> chat`
   works, and the agent answers on its own channel. The console exposes a chat
   affordance per agent.
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

- Ports, model ids and peer names must match `config.yaml` exactly.
- A peer named in `AGENTS.md` must exist in the topology table above.
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

## Remote layout

```
/home/bor/.hermes/
├── SOUL.md                 orchestrator doc set
├── constitution.md         one section per agent, all seven
├── config.yaml             model, ports, a2a_agents, delegation, mcp
├── .env                    credentials — never read by the dashboard
└── profiles/<id>/
    ├── SOUL.md  AGENTS.md  IDENTITY.md  TOOLS.md  USER.md  HEARTBEAT.md
    ├── config.yaml
    └── obsidian/self-improvement.md
```

## Change safety

Every remote write is preceded by a backup:

```
/home/bor/.hermes.backup-anim-<YYYYMMDD-HHMMSS>/
```

**Never build, install, or restart services on the server.** See rule 1 in
`AGENTS.md`. Writing markdown is a content change and is allowed; deploying is not.
