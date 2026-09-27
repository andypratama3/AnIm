# SERVER-DEFERRED — items that need a remote collector change, not a local commit

This file exists so deferred findings do not get lost behind the assumption that
"the build is green, therefore everything is complete."

## Production console on the mesh host (RESOLVED)

The console is deployed at `/opt/anim-dashboard` behind nginx
(`hermes.andypratama.studio` → `127.0.0.1:3000`) on the same host as the mesh.
Two faults followed from that and are now fixed:

1. **Write endpoints refused everything.** No `.env` file existed, so
   `ANIM_API_TOKEN` was unset, and `checkAuth` fails closed in production with
   `503 auth_misconfigured` — by design. Fixed by generating the token into
   `/opt/anim-dashboard/.env.local` (mode 600, gitignored). This was a
   misconfiguration, not a code defect; the fail-closed behaviour stayed.
2. **Read bridge was dead.** `lib/data/{remote,agent-chat,remote-probe}` each
   shelled out to `ssh root@72.61.141.91` — from that host to itself. Root has an
   `authorized_keys` and no private key, so every call returned
   `Permission denied (publickey,password)`. `/api/mesh-live` gave `503`,
   `/api/mesh` fell back to `simulated`, and chat could not start an agent.
   Fixed by `lib/data/exec-host.ts`: the transport is chosen from what is
   actually reachable, and production runs `ANIM_EXEC_MODE=local`, so the
   collector, the `hermes` CLI and `127.0.0.1:<port>` are reached directly with
   no SSH channel at all. SSH is retained only for a laptop pointed at a remote
   mesh host, and still fails closed without a key.

Still true, and deliberately not changed: `next start` binds `127.0.0.1`, and
nginx is the only public listener. The console has no per-user identity, so peer
review stays a declared name (see the deferred item below).

## A2A graph identity (DEFERRED — requires collector change)

- Registry (`agents/registry.json`): 26 agents with `reports_to` hierarchy.
- Host collector (`scripts/mesh-inventory.py` at `/home/bor/.hermes/mesh-inventory.py`):
  reads `a2a_agents` aggregate but discards identity — only keeps `peer_count`.
- Real edge set (source → target per agent) unavailable to dashboard.
- Dashboard fix (COMPLETED): `MeshGraph` draws declared `reports_to` hierarchy.
  - `MeshLink.kind = "reports-to"`
  - Label: "reporting lines" (not "links")
  - Badge: count from `visibleLinks(hierarchy, agents)`
  - No invented `strength` / `latency`
  - No animated "hot" overlay (`animateMotion` removed)
- Required for real A2A traffic: collector must emit per-peer connections.

## Full A2A metrics history (DEFERRED — requires time-series persistence)

- Current metrics endpoint (`/api/mesh-live`): point-in-time snapshot only.
- `MeshMetrics.totals.busy`, `degraded`, `avgLatency` have no history.
- `dashboard/mesh-graph.tsx`: no historical chart or trend.
- Required: collector persists `peer_count` per agent over time; dashboard reads series.
- Not required for 9-deficiency audit — this is an enhancement, not a defect fix.

## Shared token and reviewer identity (DEFERRED — out of scope for this audit)

- Token format (`A2A_PEER_TOKENS`): masked hint (`sk-or-v1-***`) only.
- Full user identity (email, role, verification status) not carried in token.
- Two-person reviewer enforcement impossible with current token format.
- Fix requires server-side identity provider change — out of scope for dashboard audit.

## Ports 9900–9925 (COMPLETED locally — server binding enforced)

- Collector reports ports as aggregate (`a2a_agents`), not per-port.
- Dashboard: `Agent.port` nullable (`number | null`); `formatPort` shows `—` when `null`.
- `app/settings/page.tsx`: "Reporting lines" tab; no fabricated `strength`/`latency`.
- Security guard (`npm run check:ports`): exits non-zero if any of 9900–9925 binds `0.0.0.0`.
- Mesh binds `127.0.0.1`: enforced by `docs/DASHBOARD.md`, `docs/AGENT_MESH.md`, CI step.

## Screenshots (8 routes × 2 viewports = 16 PNGs)

`npm run audit:ui` drives a real Chromium over CDP at 1512px and 390px and
writes a PNG per route per viewport to `/tmp/anim-audit/`. CI runs it after
`verify`, and uploads the PNGs as the `ui-audit-screenshots` artifact
(`if: always()`, 7-day retention). It fails the job on horizontal overflow,
clipped or overlapping content, console errors, a missing `<h1>`, or a document
title that is not unique.

What the audit does **not** do: execute the `INTERACTIONS` spec. No driver exists
for it, and `AUDIT_INTERACTIONS` is not read by any code path — if it is set, the
script now warns and says so. Layout, document title and console hygiene are
verified; clicking, dragging and typing are not. The spec in
`scripts/ui-audit.mjs` is a written intent, not a test result, and the per-route
files under `docs/screenshots/` record the assertions per route and viewport:

- `docs/screenshots/route-root.md` — `/`
- `docs/screenshots/route-agents.md` — `/agents`
- `docs/screenshots/route-activity.md` — `/activity`
- `docs/screenshots/route-kanban.md` — `/kanban`
- `docs/screenshots/route-analytics.md` — `/analytics`
- `docs/screenshots/route-discussion.md` — `/discussion`
- `docs/screenshots/route-notes.md` — `/notes`
- `docs/screenshots/route-settings.md` — `/settings`

They are named `route-*.md` on purpose: a bare `agents.md` inside a directory
of agent-facing documents reads as an `AGENTS.md` instruction file to tooling
that scans for it, and on a case-insensitive filesystem it collides with the
repo's real one.

CI runs against the production build on `127.0.0.1:3000` with no token set, so
`/api/mesh` resolves `simulated` and the audit screens that state. The audit is
a layout pass, not a data pass.

## References

- `docs/DASHBOARD.md` — quality bar, security rules, interaction assertions.
- `docs/AGENT_MESH.md` — mesh topology, port binding, loopback enforcement.
- `scripts/ui-audit.mjs` — `ROUTES` (executed) and `INTERACTIONS` (recorded only).
- `tests/ui-audit-bridge.test.mjs` — every route keeps an interaction spec, and the audit's cold-start heading wait behaves (37 passing).
- `tests/mesh-layout.test.mjs` — hierarchy regression tests (18 passing).
- `tests/chat-history.test.mjs` — budget regression test (20 passing, including 19-char gap test).
- `tests/activity-feed.test.mjs` — transcript leak guard test (11 passing).
- `tests/session-gate-render.test.mjs` — shared read-only banner (10 passing).
