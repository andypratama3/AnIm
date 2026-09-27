# Hermes Mesh Audit Report

> **Snapshot, 2026-09-26. Read it as a record of that day, not as current state.**
>
> Scope: the 7 gateway profiles on the mesh host, verified read-only over SSH.
> It does **not** cover the 19 further profiles in `agents/registry.json` that
> have no port assigned and no gateway, and it does not cover the console at
> `/opt/anim-dashboard`, which was deployed after this audit. For the current
> mesh truth read `docs/AGENT_MESH.md`; for what is still unresolved on the host
> read `docs/SERVER-DEFERRED.md`.
>
> Secrets are masked. `sk-or-v1-***` and the Discord token prefix are the only
> fragments that appear, per rule 2 in `AGENTS.md`.

## Summary
- Profiles audited: 7 (default, ceo-bor, principal-engineer, social-media, management-research, frontend, backend)
- Config YAML: 7/7 OK
- SOUL.md: 7 present; Obsidian mention only in frontend (used for integration) — others missing per full spec
- Gateway: 7 running (ports 9900-9906 LISTEN)
- A2A mesh: all enabled, peers complete (6/7, self missing expected)
- Models: all openrouter / thinkingmachines/inkling:free
- API key: 7/7 valid sk-or-v1-*** (free_tier true; usage 0.002)
- MCP: 7/7 obsidian wired; vault=/home/bor/Documents/Obsidian/Hermes-Agent
- Vault: present with Projects/Daily/Research/Memory-Review/Skills-Notes/Templates/README.md/Agent-Note.md
- Kanban: board default empty
- Delegation: default block only (max_depth=2, concurrent=3)
- Credentials: openrouter id=df81e2 exhausted (402) 41m left
- Discord token: synchronized to frontend/backend .env
- 8642 proxy: user-added proxy active (not native gateway)
- Console build: not performed here. Build artifacts present from an earlier
  attempt; the authoritative build happens locally in this repo
- Read-only audit: no changes to mesh configuration, with one exception — a
  Discord token sync into two profile `.env` files, which was requested and is
  recorded here rather than hidden behind the word "read-only"

## Profile Inventory
| Profile | Dir | Config YAML | SOUL.md | MCP | Port | Gateway |
|---------|-----|-------------|---------|-----|------|---------|
| default | OK | OK | OK (no Obsidian mention) | OK | 9900 | running |
| ceo-bor | OK | OK | OK (no Obsidian mention) | OK | 9901 | running |
| principal-engineer | OK | OK | OK (no Obsidian mention) | OK | 9902 | running |
| social-media | OK | OK | OK (no Obsidian mention) | OK | 9903 | running |
| management-research | OK | OK | OK (no Obsidian mention) | OK | 9904 | running |
| frontend | OK | OK | OK (mentions Obsidian) | OK | 9905 | running |
| backend | OK | OK | OK (no Obsidian mention) | OK | 9906 | running |

## Model Configuration
All 7 profiles: provider=openrouter, default=thinkingmachines/inkling:free, base_url=https://openrouter.ai/api/v1

## A2A Mesh
All profiles enabled. Ports 9900-9906 LISTEN (ss verified). Each profile knows 6 peers (missing self = expected). No empty tokens (Step 17 drift clean).

## MCP Servers
All 7: obsidian present. Vault path=/home/bor/Documents/Obsidian/Hermes-Agent. Toolsets=notes_write,vault_analysis.

## Obsidian Vault
Path: /home/bor/Documents/Obsidian/Hermes-Agent
Structure: Projects, Daily, Research, Memory-Review, Skills-Notes, Templates, README.md, Templates/Agent-Note.md
Ownership: bor:bor

## Issues Found (raw evidence)
1. Gateway plugin API 8642: not native; proxy added by user earlier (curl returns {"status":"ok"})
2. OpenRouter key: exhausted (402), 41m remaining — free tier only; no paid model usage possible without top-up
3. MCP direct chat: timeout 120s under hermes chat (MCP stdio slow); server starts correctly with env
4. Default gateway logs (journalctl): WARNING discord rate-limit; ERROR email IMAP timeout; WARNING previous SIGKILL/OOM (suspected_oom=True)
5. SOUL.md Obsidian mention: only frontend; 6/7 missing — full integration not applied to all
6. Console build: not run on the host. `.next/` artifacts from an earlier attempt
   were present but unverified. Rule 1 in `AGENTS.md` now forbids building there
   at all, so this is no longer an open question.
7. Retinue mcp_spawn_agent: unavailable in environment (error module missing); fallback opencode used
8. Kanban board: default board exists but empty (no tasks)

## Recommendations
- Apply Obsidian reference to remaining 6 SOUL.md if full integration required
- Restart gateway after prior OOM (SIGKILL) if stability needed — ask first; a
  gateway restart on the agent server is not a step to take on your own
- Wait for OpenRouter free reset or use cached/proxy results
- Console changes: build and verify locally in this repo, then deploy the
  artifact. Never `npm run build`, `npm ci` or a gateway restart on the mesh host
- Consider fixing retinue package dependency if spawn_agent needed
