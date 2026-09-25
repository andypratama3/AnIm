# Hermes Mesh Audit Report

## Summary
- Profiles: 7 (default, ceo-bor, principal-engineer, social-media, management-research, frontend, backend)
- Config YAML: 7/7 OK
- SOUL.md: 7 present; Obsidian mention only in frontend (used for integration) — others missing per full spec
- Gateway: 7 running (ports 9900-9906 LISTEN)
- A2A mesh: all enabled, peers complete (6/7, self missing expected)
- Models: all openrouter / thinkingmachines/inkling:free
- API key: 7/7 valid sk-or-v1-e82... (free_tier true; usage 0.002)
- MCP: 7/7 obsidian wired; vault=/home/bor/Documents/Obsidian/Hermes-Agent
- Vault: present with Projects/Daily/Research/Memory-Review/Skills-Notes/Templates/README.md/Agent-Note.md
- Kanban: board default empty
- Delegation: default block only (max_depth=2, concurrent=3)
- Credentials: openrouter id=df81e2 exhausted (402) 41m left
- Discord token: synchronized to frontend/backend .env
- 8642 proxy: user-added proxy active (not native gateway)
- Build: blocked by user instruction; .next artifacts exist
- Read-only audit: no changes except Discord sync

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
6. Build (Next.js): blocked per user instruction; .next/ build artifacts present but not fully verified
7. Retinue mcp_spawn_agent: unavailable in environment (error module missing); fallback opencode used
8. Kanban board: default board exists but empty (no tasks)

## Recommendations
- Apply Obsidian reference to remaining 6 SOUL.md if full integration required
- Restart gateway after prior OOM (SIGKILL) if stability needed
- Wait for OpenRouter free reset or use cached/proxy results
- Confirm build when user approves
- Consider fixing retinue package dependency if spawn_agent needed
