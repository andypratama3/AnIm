---
type: improvisation-guide
agent: all
---

# Hermes Mesh Improvisation Master (bor, /home/bor/.hermes)

## Profiles & Ports
| Profile | Port | Model | Role |
|---------|------|-------|------|
| default | 9900 | thinkingmachines/inkling:free | CEO Bor / Orchestrator |
| ceo-bor | 9901 | thinkingmachines/inkling:free | Coordinator |
| principal-engineer | 9902 | thinkingmachines/inkling:free | Executor |
| social-media | 9903 | thinkingmachines/inkling:free | Content |
| management-research | 9904 | thinkingmachines/inkling:free | Research |
| frontend | 9905 | thinkingmachines/inkling:free | UI execution |
| backend | 9906 | thinkingmachines/inkling:free | Server execution |

## Key Files (read-only audit verified)
- Configs: `~/.hermes/config.yaml` + `profiles/*/config.yaml` (7 OK)
- SOUL.md: `~/.hermes/SOUL.md` + `profiles/*/SOUL.md` (frontend has Obsidian ref; others missing)
- .env: 7 profiles have `OPENROUTER_API_KEY=sk-or-v1-e82...` (free tier, exhausted 402, 41m left)
- A2A: all enabled, mesh full, ports LISTEN
- MCP: `mcp_servers.obsidian` in all 7 configs (vault=/home/bor/Documents/Obsidian/Hermes-Agent)
- Vault: `/home/bor/Documents/Obsidian/Hermes-Agent` (7 dirs + README + Template)
- Dashboard: `/home/bor/workspace/hermes-dashboard` (.next partial)
- Discord token: synchronized to frontend/backend .env (`MTU0...`)
- Backup: `~/.hermes.backup-20260926-060035`, `frontend-backend-...`

## Quick Commands
- Profile list: `export PATH=/home/bor/.local/bin:$PATH; hermes profile list`
- Gateway restart: `hermes -p <name> gateway restart`
- A2A test: `hermes chat -q "Use a2a_call to ask frontend what it can do."`
- OpenCode via bridge: `/code-bridge` inside session
- Retinue MCP: `mcp_retinue_spawn_agent` (unavailable in env; fallback opencode)
- Obsidian MCP: configured; direct chat timeout; server starts with env
- Vault notes: `/home/bor/Documents/Obsidian/Hermes-Agent/Projects/`, `Daily/`, etc.

## Limitations (audited)
- Gateway 8642: proxy only (not native plugin endpoint)
- OpenRouter: free tier exhausted (402); paid models blocked
- Build: blocked by user; .next exists but unverified
- MCP chat: timeout 120s; config correct
- Retinue spawn_agent: module missing; use direct opencode
- Default gateway logs: SIGKILL/OOM previous, discord rate-limit, email IMAP timeout
- SOUL.md Obsidian mention: only frontend; need to add to 6 others if full spec required
- Kanban: board `default` empty

## Improvisation Recipes
1. New profile: `hermes profile create <name>`, edit `config.yaml`, `SOUL.md`, `.env`, add to mesh in default + peer .env
2. Change model: edit `config.yaml` `model.default` (use `:free` variant)
3. Add A2A peer: edit `config.yaml` `a2a_agents` + `.env` token + `SOUL.md`
4. Write note: use `obsidian` MCP or direct file under vault dirs
5. Test chain: default → ceo-bor → principal-engineer → frontend/backend via A2A
6. Build dashboard: `npm run build` (confirm when ready)

## Rules (do not forget)
- Never modify other users (root/ubuntu/borr)
- Always backup `.env`/`config.yaml` before edit
- Validate YAML with `python3 -c "import yaml; yaml.safe_load(open('PATH'))"`
- Report raw evidence, never summarize failures
- If step fails, STOP and report exactly
- No secrets in vault; truncate tokens to 12 chars in reports
