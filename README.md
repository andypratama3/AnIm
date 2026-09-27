# AnIm — Agent Intelligence Mesh

A read-mostly console for supervising a mesh of autonomous Hermes agents: 26
profiles, 5 departments, one orchestrator that routes work and refuses to hand
Andy anything it has not verified.

The point of this repo is not the charts. It is the rule that the UI never shows
a number it cannot source. Real telemetry or a labelled `—`.

## Routes

| Route | What it answers | Data |
| --- | --- | --- |
| `/` | Mesh overview, reporting hierarchy, throughput, latency, token spend | `/api/mesh` |
| `/agents` | Peer roster, live constellation, inspector drawer | `/api/mesh`, `/api/mesh-live` |
| `/activity` | Recorded event stream, pause, filter | `/api/activity` |
| `/kanban` | Hermes work board, `?new=1` composes | `/api/board` |
| `/analytics` | Tables and charts | `/api/mesh` |
| `/discussion` | Per-agent chat and the owner review queue | `/api/agent-chat` |
| `/notes` | Working notes, explicitly **not** the Obsidian vault | `/api/notes` |
| `/settings` | Preferences | local |

`npm run audit:ui` checks all eight at **1512px** and **390px**: horizontal
overflow, clipped text, elements wider than the viewport, and console errors.

## Running it

```bash
npm ci
npm run dev        # 127.0.0.1 only, never 0.0.0.0
```

`dev` and `start` both pin `-H 127.0.0.1`. Next.js defaults to `0.0.0.0`, which
would publish a page that can dispatch work to 26 agent profiles to everything
on the network. To reach it from another machine, tunnel:

```bash
ssh -L 3000:127.0.0.1:3000 root@72.61.141.91
```

### Transport

The console is deployed **on** the mesh host (`/opt/anim-dashboard`, behind
nginx), so it runs `ANIM_EXEC_MODE=local`: the collector, the `hermes` CLI and
`127.0.0.1:<port>` are reached directly and no SSH channel is opened to itself.
On a laptop, `auto` falls back to SSH and fails closed without a key. See
[docs/SECURITY.md](docs/SECURITY.md).

### Auth

Write-capable endpoints require `ANIM_API_TOKEN` or a session cookie. With no
token configured, they answer `503 auth_misconfigured` **by design** rather than
opening up. Read-only routes (`/api/mesh`, `/api/mesh-live`) stay open; they
expose no secrets. Set it in `.env.local` (gitignored, mode 600):

```bash
openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48
```

Never in a doc, a commit, or a transcript. `.env.example` documents every
variable the code reads.

## Definition of done

```bash
npm run verify     # secret scan + tsc + eslint --max-warnings=0 + tests + build
npm run audit:ui   # needs a served app; fails on overflow, clipping, console errors
```

The test suite is the honesty guard: it fails if a fabricated series, a
constant health score, a port table that drifts from `agents/registry.json`, a
mutating route without origin and auth checks, or a token-shaped string comes
back. 317 tests, no test-runner dependency — Node runs the TypeScript sources
directly.

## Docs

| File | Contents |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Operating rules. Read before doing anything here. |
| [docs/DASHBOARD.md](docs/DASHBOARD.md) | Truth rules, routes, live bridge, layout invariants |
| [docs/AGENT_MESH.md](docs/AGENT_MESH.md) | Mesh specification: topology, profiles, ports, doc set |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, forbidden list, bridge contract |
| [docs/HERMES-LOCAL-SETUP.md](docs/HERMES-LOCAL-SETUP.md) | What the host still has to export, per area |
| [docs/SERVER-DEFERRED.md](docs/SERVER-DEFERRED.md) | Findings that need a server decision, not a commit |
| [docs/screenshots/](docs/screenshots) | Per-route audit assertions |
| [AUDIT_REPORT.md](AUDIT_REPORT.md) | Dated snapshot of the 7-profile mesh audit |
| [IMPROVISATION_MASTER.md](IMPROVISATION_MASTER.md) | Operator runbook for the mesh host |

## Rules worth knowing before you touch anything

1. **Never build or deploy on the agent server.** Builds happen locally. The
   server is runtime and content only.
2. **No secrets, ever.** This remote is public. `npm run scan:secrets` and the
   `secret-guard` workflow both fail a leak.
3. **Mesh ports `9900`–`9925` are server-private.** A gateway binds
   `127.0.0.1`, never `0.0.0.0`. `npm run check:ports` audits the host in place
   and exits non-zero if that range is exposed.

Details in [AGENTS.md](AGENTS.md).
