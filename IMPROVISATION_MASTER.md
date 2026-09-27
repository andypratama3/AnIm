---
type: improvisation-guide
agent: all
---

# Hermes Mesh Improvisation Master (bor, /home/bor/.hermes)

> Last verified read-only on 2026-09-26 against the 7 gateway profiles. The mesh
> host is **runtime and content only**: this file is content, and editing agent
> markdown here is fine. Building, installing or restarting services there is
> not — see the rules at the bottom and rule 1 in `AGENTS.md`.
>
> The model column below comes from reading each `config.yaml`. The console
> cannot show it: the host does not report a resolved model per peer, so
> `/agents` renders an em dash for `Model` and `Provider` on purpose. The two
> are not in conflict — one is a config read, the other is a live field that does
> not exist.

## Profiles & Ports
| Profile | Port | Configured model | Role |
|---------|------|------------------|------|
| default | 9900 | thinkingmachines/inkling:free | CEO Bor / Orchestrator |
| ceo-bor | 9901 | thinkingmachines/inkling:free | Coordinator |
| principal-engineer | 9902 | thinkingmachines/inkling:free | Executor |
| social-media | 9903 | thinkingmachines/inkling:free | Content |
| management-research | 9904 | thinkingmachines/inkling:free | Research |
| frontend | 9905 | thinkingmachines/inkling:free | UI execution |
| backend | 9906 | thinkingmachines/inkling:free | Server execution |

Ports 9907-9925 are reserved and unallocated. `9900`-`9906` must stay on
`127.0.0.1`; `npm run check:ports` fails if any of `9900`-`9925` binds
`0.0.0.0` or is opened in the firewall.

## Key Files (read-only audit verified)
- Configs: `~/.hermes/config.yaml` + `profiles/*/config.yaml` (7 OK)
- SOUL.md: `~/.hermes/SOUL.md` + `profiles/*/SOUL.md` (frontend has Obsidian ref; others missing)
- .env: 7 profiles have `OPENROUTER_API_KEY=sk-or-v1-*** (redacted)` (free tier, exhausted 402, 41m left)
- A2A: all enabled, mesh full, ports LISTEN
- MCP: `mcp_servers.obsidian` in all 7 configs (vault=/home/bor/Documents/Obsidian/Hermes-Agent)
- Vault: `/home/bor/Documents/Obsidian/Hermes-Agent` (7 dirs + README + Template)
- Console: deployed at `/opt/anim-dashboard` behind nginx
  (`hermes.andypratama.studio` → `127.0.0.1:3000`), running with
  `ANIM_EXEC_MODE=local`. The older `/home/bor/workspace/hermes-dashboard` path
  is a stale worktree, not the deployment.
- Discord token: synchronized to frontend/backend .env (`MTU0...`)
- Backup: `~/.hermes.backup-20260926-060035`, `frontend-backend-...`

## Quick Commands
- Profile list: `export PATH=/home/bor/.local/bin:$PATH; hermes profile list`
- Gateway restart: `hermes -p <name> gateway restart` — **ask the user first**;
  the host is not a place to restart services to "pick up a change"
- A2A test: `hermes -p <name> -z "Use a2a_call to ask frontend what it can do."`
  — `-z` buffers the whole reply and emits it at the end, so the console cannot
  stream it. That is a property of the flag, not a bug to work around with a
  fake typing animation.
- OpenCode via bridge: `/code-bridge` inside session
- Retinue MCP: `mcp_retinue_spawn_agent` (unavailable in env; fallback opencode)
- Obsidian MCP: configured; direct chat timeout; server starts with env
- Vault notes: `/home/bor/Documents/Obsidian/Hermes-Agent/Projects/`, `Daily/`, etc.

## Limitations (audited)
- Gateway 8642: proxy only (not native plugin endpoint)
- OpenRouter: free tier exhausted (402); paid models blocked
- Console build: not run here and not permitted here. Build and verify locally,
  then deploy the artifact. Artifacts from an earlier attempt were left in place.
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
6. Console change: write it in the git repo, run `npm run verify` locally, deploy
   the artifact. Never build, install or restart on this host.

## Rules (do not forget)
- Never modify other users (root/ubuntu/borr)
- Always backup `.env`/`config.yaml` before edit, into
  `/home/bor/.hermes.backup-anim-<timestamp>/`
- Validate YAML with `python3 -c "import yaml; yaml.safe_load(open('PATH'))"`
- Report raw evidence, never summarize failures
- If step fails, STOP and report exactly
- **No secrets in this file, in the vault, in a doc, a comment, a commit message
  or a dashboard field.** A masked prefix is the most that appears: `sk-or-v1-***`,
  `MTU0***`. Do not truncate a real token to 12 characters — a prefix of a live
  credential is still a leak into a public repository, and `scripts/secret-scan.sh`
  plus the `secret-guard` workflow will fail the commit either way.
