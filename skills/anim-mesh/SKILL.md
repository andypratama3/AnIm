---
name: anim-mesh
description: Live wiring for the AnIm dashboard (anim-mesh v2, github andypratama3/AnIm) to the Hermes agent mesh. Use when working on the dashboard, mesh bridge, or agent connectivity.
---

# anim-mesh

Live-wiring skill for the AnIm dashboard at `/home/bor/workspace/hermes-dashboard`
(repo `andypratama3/AnIm`, package `anim-mesh`).

## When to use

- Editing dashboard pages, API routes, or mesh data layers.
- Diagnosing why an agent shows offline/degraded.
- Verifying A2A connectivity, kanban, chat, or session wiring.

## Architecture (read first)

- Live bridge: `lib/data/exec-host.ts` picks transport (`auto`/`local`/`ssh`/`off`).
  Production runs `ANIM_EXEC_MODE=local` — collector, `hermes` CLI, and
  `127.0.0.1:<port>` are all on this host. Never SSH to ourselves.
- Read-only collector: `scripts/mesh-inventory.py` (also at
  `/home/bor/.hermes/mesh-inventory.py`). Reads `registry.json`,
  `gateway_state.json`, TCP sockets, and public agent cards only.
- Single port truth: `agents/registry.json` (26 ports, 9900–9925). Never
  hardcode a mesh port in code — `tests/registry-ports.test.mjs` fails on it.
- Model target (all 26 profiles): 9Router `http://127.0.0.1:20128/v1`,
  model `oc/muse-spark-1.3-contributor-free`. The host reports no per-agent
  model, so the UI renders model as unmeasured (`—`), never guessed.
- Honesty rules (`docs/DASHBOARD.md` truth rules): unmeasured renders as `—`,
  simulated data is labelled, never present fallback as live.
- Write endpoints (`/api/agent-chat`, `/api/board`, `/api/tasks`,
  `/api/session`) require `ANIM_API_TOKEN` + HttpOnly session cookie, origin
  check, rate limit, concurrency cap. Read routes stay open.

## Instructions

1. **Scope is AnIm only.** Touch only `/home/bor/workspace/hermes-dashboard`.
   Never touch other projects under `/home/bor/workspace` or `/home/bor/project`.
2. **Forbidden sources.** Never read `.env`, `auth.json`, or `config.yaml`
   (they carry A2A bearer tokens). Never print a token or key. Run
   `npm run scan:secrets` before finishing.
3. **Keep the honesty invariants.** No invented numbers, no `?? 0` on ports,
   no agent-card name in a Model column. The test suite guards these — run it.
4. **Verify every change** (the `verify` script):
   `npm run scan:secrets && npx tsc --noEmit && npm run lint && npm test && npm run build`.
5. **Deploy path.** systemd `anim-dashboard.service` → `next start -H 127.0.0.1 -p 3000`
   → nginx `hermes.andypratama.studio` → `127.0.0.1:3000`.
