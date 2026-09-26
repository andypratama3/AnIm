# SERVER-DEFERRED — items that need a remote collector change, not a local commit

This file exists so deferred findings do not get lost behind the assumption that
"the build is green, therefore everything is complete."

## A2A graph identity
- `agents/registry.json` lists 26 agents with `reports_to`.
- The host collector (`script/mesh-inventory.py` / `/home/bor/.hermes/mesh-inventory.py`)
  reads `a2a_agents` but only keeps `peer_count`, not the identity of which peer
  connects to which. The real edge set is therefore unavailable to the UI.
- The dashboard's `MeshGraph` now draws the declared `reports_to` hierarchy.
  The label reads "reporting lines", the overlay animation that used to ride
  edges is removed, and no link carries a fabricated `strength` or `latency`.
- For real A2A traffic: the collector needs to emit each peer's connections
  (source, target) rather than only the aggregate count.

## Full A2A metrics
- There is no history of `peer_count` in the dashboard today. The metrics
  endpoint reports a point-in-time value.
- To add the history: the collector needs to persist per-peer `a2a_agents`
  to a time-series store; the dashboard reads it via a new endpoint or file.
- Not required for the 9-deficiency audit, but listed here so the feature does
  not get mistaken for complete.

## Shared token and reviewer identity
- The token format (`A2A_PEER_TOKENS`) carries only a masked identity hint,
  not the full user identity. A two-person reviewer check is therefore
  unenforceable with the current format.
- This is out of scope for the audit fixes: fixing identity is a server/mesh
  change, not a dashboard one.

## Ports 9900–9925
- The live collector reports ports as a single aggregate (`a2a_agents`), not
  per-port bindings. The dashboard uses `agent.port ?? null`; `formatPort`
  shows nothing for `null`.
- If a gateway binds `0.0.0.0` in the 9900–9925 range, `npm run check:ports`
  exits non-zero. The mesh itself binds `127.0.0.1`, which this repo enforces
  via `docs/DASHBOARD.md`, `docs/AGENT_MESH.md`, and the CI `check-ports` step.
