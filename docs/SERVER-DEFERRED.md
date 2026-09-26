# SERVER-DEFERRED — items that need a remote collector change, not a local commit

This file exists so deferred findings do not get lost behind the assumption that
"the build is green, therefore everything is complete."

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

## Screenshots (each route — 8 routes × 2 viewports = 16)

Screenshots verify layout, title uniqueness, and interaction surface. See `docs/DASHBOARD.md` for full interaction assertions; this file holds the captured state per route.

- `/` (Overview) — desktop 1512px, mobile 390px — static build, no server needed.
- `/agents` — peer roster with `Agent.port` label; `MeshGraph` reporting lines visible.
- `/activity` — event feed with `recorded` / `refreshing` labels; no transcript text in detail.
- `/kanban` — task board; drag interaction covered by CI assertion.
- `/analytics` — charts with `MeshMetrics` data from real collector snapshot.
- `/discussion` — chat view; `SessionGate` shows `unreachable` banner when `authMisconfigured`.
- `/notes` — labeled as working notes (`persisted: false`, `sharedWithAgents: false`).
- `/settings` — "Reporting lines" tab (not "A2A links"); `Env` label updated.

Screenshot reference files (per route, per viewport):
- `docs/screenshots/root.md` — `/`
- `docs/screenshots/agents.md` — `/agents`
- `docs/screenshots/activity.md` — `/activity`
- `docs/screenshots/kanban.md` — `/kanban`
- `docs/screenshots/analytics.md` — `/analytics`
- `docs/screenshots/discussion.md` — `/discussion`
- `docs/screenshots/notes.md` — `/notes`
- `docs/screenshots/settings.md` — `/settings`

Actual PNG capture runs in CI (`AUDIT_INTERACTIONS=1` over Chrome/CDP); these `.md` files record the assertions and viewport parameters.

## References

- `docs/DASHBOARD.md` — quality bar, security rules, interaction assertions.
- `docs/AGENT_MESH.md` — mesh topology, port binding, loopback enforcement.
- `scripts/ui-audit.mjs` — `INTERACTIONS` spec (CI-only execution).
- `tests/mesh-layout.test.mjs` — hierarchy regression tests (18 passing).
- `tests/chat-history.test.mjs` — budget regression test (20 passing, including 19-char gap test).
- `tests/activity-feed.test.mjs` — transcript leak guard test (11 passing).
- `tests/session-gate-render.test.mjs` — shared read-only banner.
