# AnIm Dashboard

Observability surface for the 26-agent Hermes mesh. This document is the
contract for what the UI is allowed to claim, how live data reaches it, and how
a change is considered done.

## Truth rules (non-negotiable)

1. **Never present simulated data as measured data.** Every `Series` carries
   `synthetic: boolean` and `resolutionSec: number`. Charts render a visible
   warning when `synthetic` is true.
2. **Throughput is a rate, not a count.** The header shows mean rps, peak rps and
   error count for the selected window. Summing samples into a "requests" total
   was the original defect and must not come back.
3. **Window controls reflect the data that exists.** `30m` and `1h` only appear
   when the series actually spans that long. Sampling by point index made every
   range look identical; ranges are now sliced by elapsed time.
4. **Live and simulated are separate transports.** `/api/mesh-live` is the only
   source allowed to say `mode: "live"`. If the bridge is down the route returns
   `503` with a reason instead of degrading to fabricated numbers.
5. **Peer review is enforced, not decorative.** A work item may only reach
   `VERIFIED` after a reviewer other than its owner signs off. The owner inbox
   must not offer a control that skips this.

## Routes

| Route | Purpose | Data |
| --- | --- | --- |
| `/` | Mesh overview, topology, throughput, latency, token spend | `/api/mesh` |
| `/agents` | Peer roster, live constellation, inspector drawer | `/api/mesh`, `/api/mesh-live` |
| `/activity` | Recorded event log, filter by level/kind/peer, pause refetch | `/api/activity` |
| `/kanban` | Work board, `?new=1` deep link to compose | `/api/board` |
| `/analytics` | Tables and charts | `/api/mesh` |
| `/discussion` | Per-agent chat and the owner review queue | `/api/agent-chat` |
| `/notes` | Working notes — **not** the Hermes vault | `/api/notes` |
| `/settings` | Preferences | local |

Every route needs exactly one `<h1>`, a unique document title, and zero
horizontal overflow at **1512px** and **390px**. The topbar shows the route
name, but it is a `<p>`: a second `<h1>` in the chrome duplicated the page's own
heading on seven of eight routes, and the audit's "an `<h1>` exists" test was
satisfied by either one. `npm run audit:ui` now fails a route that renders more
than one.

## Live bridge

`lib/data/exec-host.ts` picks a transport and runs `scripts/mesh-inventory.py`,
returning a typed snapshot. It is the only place that decides *where* a mesh call
runs; `lib/data/remote.ts`, `lib/data/agent-chat.ts` and
`lib/data/remote-probe.ts` all go through it.

| `ANIM_EXEC_MODE` | Behaviour |
| --- | --- |
| `auto` (default) | Local when the collector/CLI is on this filesystem, otherwise SSH |
| `local` | Always here; fails closed if the mesh is not on this host |
| `ssh` | Always SSH, for a laptop pointed at a remote mesh host |
| `off` | No bridge; read routes return a typed `unavailable` state |

**The production deployment runs on the mesh host** and is configured
`ANIM_EXEC_MODE=local`. The collector, the `hermes` CLI and `127.0.0.1:<port>`
are all local, so every call goes direct.

That is not a stylistic choice. The console used to SSH to `72.61.141.91` from
all three paths while itself running on `72.61.141.91`, and root holds an
`authorized_keys` but no private key — so the hop answered `Permission denied
(publickey,password)`. `/api/mesh-live` returned `503`, `/api/mesh` silently
degraded to simulated data, and every chat turn failed at the transport. A
loopback call has no key to misplace and no channel to open.

Both transports keep the original guarantees:

- Fixed command. No caller-supplied command is ever interpolated.
- The profile id is validated against a hard allowlist before a process spawns;
  the probe port comes from the registry as a validated integer.
- Bounded: hard timeouts, a 512 KB output ceiling, JSON validated before use.
- The local branch pins `HOME` so the collector and the CLI resolve the same
  profile directory regardless of which account started the server.
- The SSH branch keeps `BatchMode=yes`, so a missing key fails closed.
- The script is read-only: it reads `registry.json`, `gateway_state`, agent cards
  and document presence, and returns counts and public fields only. It never
  returns env values, tokens, or file bodies.
- Filename allowlist stays `*.md`. Do not widen it.

### Conversation transcripts

Chat history is file-backed per profile under `.data/chat/<profile>.json`
(`lib/data/chat-store.ts`), so a reload keeps the conversation and switching
agents shows that agent's history instead of a shared pile.

- The profile comes from the chattable allowlist before it is used as a path
  segment, which is what makes traversal impossible. An unroutable profile
  raises rather than returning an empty log, so a typo cannot look like an
  erased conversation.
- The user's message is written **before** the agent is called, so a timeout or
  a dead transport still leaves the question on record. A failed reply is stored
  with `failed: true` and renders as an error, never as a normal answer.
- Writes are atomic; the log is capped at `ANIM_CHAT_MAX_MESSAGES` and the
  number of discarded turns is reported to the UI rather than dropped silently.
- The server returns the stored transcript with every reply, and the client
  replaces local state with it, so the screen cannot drift from the file.
- `DELETE /api/agent-chat?profile=…` clears one conversation, and only that one.
- Transcripts contain real agent output, so `GET` and `DELETE` require the same
  token as sending.
- `hermes -p` is still a one-shot call: every turn is a fresh process, so no
  agent carries state of its own. Prior turns are instead re-supplied on every
  request as context, assembled **on the server from the server's own
  transcript** — the client posts `{ profile, prompt }` and cannot dictate what
  the agent is told about the past. It is a transcript handed over each time,
  not memory the agent retains.
- That context is bounded, and degrades rather than fails: the question is never
  truncated, prior turns are trimmed oldest-first until the prompt fits
  `MAX_PROMPT_CHARS`, a single turn is capped, and a failed delivery is skipped.
  A long conversation sends a short context; it does not return a 400.

### Write endpoints: auth and rate limits

`app/api/agent-chat` executes a one-shot prompt against a named Hermes profile.
It is allowlisted to the 26 registry ids, caps prompt and output size, and
rejects traversal. Because one request starts a real remote process that can run
for minutes, `lib/security/guard.ts` puts three limits in front of it:

- **Auth.** The profile list and every chat call require either the
  `ANIM_API_TOKEN` bearer value or a valid session cookie. Read-only routes
  (`/api/mesh`, `/api/mesh-live`) stay open: they expose no secrets and the UI
  has no session, so gating them would only add a login wall in front of public
  counters.
- **Session, not browser token.** The operator pastes the token once into
  `SessionGate`; `/api/session` verifies it with a constant-time compare and
  returns an HttpOnly, SameSite=Strict cookie scoped to `/api`. The token never
  reaches page JavaScript.
- **Rate limit and concurrency.** Per-client budget
  (`ANIM_CHAT_RATE_LIMIT`, default 6 per `ANIM_CHAT_RATE_WINDOW_MS`) plus a global
  ceiling on simultaneous remote processes (`ANIM_CHAT_MAX_CONCURRENT`, default
  2). Exhausting the ceiling returns `503` rather than queueing unbounded work.

With `ANIM_API_TOKEN` unset the endpoint stays reachable, which is only
acceptable for local development on a trusted machine. **Set it in any shared or
public deployment** — the production host serves this over
`hermes.andypratama.studio`, so it is not optional there. The value lives in
`/opt/anim-dashboard/.env.local` (mode 600, gitignored). To read it for the login
field, print it on the host yourself; never paste it into a doc, a commit, or a
shared transcript:

```
grep '^ANIM_API_TOKEN=' /opt/anim-dashboard/.env.local | cut -d= -f2-
```

### The write-guard contract

Every mutating handler calls `checkOrigin(request)` and then `checkAuth(request)`.
This is a contract, not a convention: `tests/write-route-guards.test.mjs` reads
the routes as source and fails if a `POST`/`PATCH`/`PUT`/`DELETE` handler is
added without both. `/api/board` was the gap that motivated it — it accepted a
create, a move and a delete from anyone who could reach the port while its four
sibling routes were careful. An exemption is allowed but has to state its
reason, and the test fails if the handler it names no longer exists.

`checkOrigin` compares the `Origin` header against the request host and refuses a
mismatch. A request with no `Origin` at all is allowed, because `curl` and CI
do not send one and the token is the credential in that case. `SameSite=Strict`
already blocks the ordinary cross-site POST; this is the second layer.

**Production fails closed.** With no `ANIM_API_TOKEN`, `checkAuth` returns `503`
with `code: "auth_misconfigured"` instead of treating the endpoint as open. The
code matters because the rate limiter and the concurrency ceiling also return
`503`, and a client that matched on the status alone would tell the operator to
sign in again to a deployment that has no token to sign in with. `SessionGate`
reads the code and says what is actually wrong.

### Review attribution is declared, not proven

The review queue records who acted on a transition, and the name arrives in the
request body. `transition()` validates it against `agents/registry.json` so an
invented name cannot be written into an audit log, and stores it with
`attribution: "declared"`.

This is the honest limit of the design rather than a bug to be papered over. The
console holds **one shared token**, so the server cannot tell which person typed
a request and cannot enforce that a *second* person reviewed anything. The
acceptance policy in the registry is therefore checked against a declared name.
The UI says so in the toast rather than claiming a peer review was confirmed.
Enforcing real two-person review needs per-user identity, which is a larger
change than a guard function.

## What the topology draws

The constellation on `/` only places agents that are up. `offline` means the
process is not running, so those agents take no slot on the ring, contribute no
link, and cannot be focused from the chart. A stopped gateway cannot answer, and
drawing it as a peer implied otherwise — the chart was spending most of its area
on nodes that could not respond.

Three things follow from the same filter, and all three are asserted in
`tests/mesh-layout.test.mjs`:

- The ring is divided by the number of **visible** agents, not the roster size.
  Sizing the layout from the full roster while drawing a subset is what packed 26
  nodes into a ring that could hold a handful.
- The `links` badge counts the links actually drawn. A link to a hidden agent
  would be a line running to nothing, and counting it would report connections
  the chart does not show.
- An `N of M active` badge sits beside it, so the reduction is visible instead of
  looking like lost data.

`AgentStrip` is deliberately **not** filtered. It is the focus picker on `/`
`/agents` and `/kanban`, and an offline agent is still worth selecting there.

Bubble radii are smaller than the arc that holds them: at `RADIUS` 218, 26 nodes
share about 53px of arc, and the widest bubble is 44px across. Label offsets are
derived from the radius rather than written as constants, so shrinking a circle
cannot leave its port label floating below it.

## Realtime behaviour

`LiveConstellationPanel` polls `/api/mesh-live` every 15s and refetches when the
tab becomes visible, showing a live dot and the age of the last read. Polling is
used deliberately: the bridge is an on-demand collect, so a websocket would
add a long-lived privileged channel for no gain.

Polling refreshes what the host reports. It does not make a stopped gateway run —
7 gateways are live and 19 profiles are wired but stopped, and the UI says so.

## Ports

`9900`–`9925` is the **assigned** range for the mesh. All 26 registry entries
carry a port (**9900–9925**, synced with the host registry): the 7 running
gateways answer, the 19 stopped ones report `installed` and render as stopped,
never as missing. `tests/registry-ports.test.mjs` fails if the registry drops
below 26 assigned ports, if a module hardcodes a mesh port again, or if two
profiles claim one.

**The mesh range is server-private and must stay that way.** A gateway binds
`127.0.0.1`, never `0.0.0.0`. The ports carry agent cards and peer material, and
nothing outside the host needs to reach them: the console dials them over
loopback, and the browser only ever talks to its own Next server. The host also
runs `iptables` with `INPUT` policy `DROP`, opening just `22`, `80`, `443` and
`icmp`.

Verify it at any time — read-only, no writes to the server:

```
npm run check:ports
```

It audits this host in place (no SSH) and exits non-zero if any mesh port binds a
non-loopback address, or if a firewall rule opens the range. A future gateway
started with the wrong bind address is the realistic way this breaks, and that is
the case the check exists to catch.

Note that a port being closed does not mean the profile is unusable: the
`hermes -p <profile>` CLI can address a profile whose gateway is not listening,
so "19 stopped" describes the gateways, not the profiles. Starting them is a
host decision with a capacity check attached — `docs/SERVER-DEFERRED.md`.

### Local development binds loopback too

`next dev` and `next start` default to `0.0.0.0`, which publishes the dashboard
on every interface the machine has. On a laptop that is a real exposure, not a
theoretical one: the page holds an SSH path to the production host and can
dispatch work to 26 agent profiles, so anything on the same Wi-Fi would be able
to reach it.

Both scripts therefore pin `-H 127.0.0.1`, and `tests/local-bind.test.mjs` fails
the build if a flag is dropped or a new `next dev`/`next start` script appears
without one. To reach it from another machine on purpose, tunnel over SSH
instead of rebinding:

```
ssh -L 3000:127.0.0.1:3000 root@72.61.141.91
```

Server-side decisions that were deliberately not acted on are written up in
`docs/SERVER-DEFERRED.md`.


## Layout invariants

These are enforced by `npm run audit:ui` and by CI:

- Every `Card` variant sets `min-w-0`. A grid or flex item defaults to
  `min-width: auto`, so one wide descendant otherwise stretches the whole column.
- Every `display: grid` container declares `grid-cols-1`. A bare grid creates one
  implicit `auto` track sized to max-content, which is what pushed charts past a
  390px viewport.
- Wide tables and heatmaps live inside their own `overflow-x-auto` wrapper, and
  the wrapper's ancestors are shrinkable.
- `Table` carries `min-w-[42rem]` so it scrolls instead of squashing columns.
- Decorative bleed (`pointer-events-none` layers) is exempt from the audit.

## Definition of done

```
npm run verify      # secret scan + tsc + eslint --max-warnings=0 + tests + build
npm run audit:ui    # needs a served app; fails on overflow, clipping, console errors
```

`npm run audit:ui` aborts with a non-zero exit if any route failed to render, so
a dead server can never be mistaken for a clean run. Screenshots land in
`/tmp/anim-audit` and are uploaded as CI artifacts. PNGs are captured on every
run, local and CI alike.

Two details that cost a false result each, both now handled:

- **It targets `http://127.0.0.1:3000`**, the address `next start` and `next dev`
  both pin. `localhost` may resolve to `::1`, and on a dual-stack machine
  whatever else holds port 3000 over IPv6 answers instead — during this audit that
  was an unrelated project in another directory, which the run measured before the
  404s were traced. Override with `BASE_URL`.
- **It waits for the `<h1>` instead of sleeping.** The wait used to be a flat
  3.2s, and a cold production server can still be hydrating after that: the first
  route was recorded with no heading and the whole run aborted on a page that
  rendered a second later. `waitForHeading()` polls until the heading paints,
  capped by `READY_TIMEOUT_MS` (10s, override with `AUDIT_READY_TIMEOUT_MS`), and a
  page that never paints is still probed and still fails. Each check reports
  `readyMs`, and a run that needed most of the timeout says so.

### What `audit:ui` does and does not check

Checked on all 8 routes at 1512px and 390px: HTTP render, **exactly one** `<h1>`
per page, a unique `document.title` per route, horizontal overflow, elements
wider than the viewport, text clipped by a fixed-height container, and console
errors (whitelisting only a `503` from the optional live bridge, or from a deploy
with no `ANIM_API_TOKEN` where the refusal is the designed behaviour).

**Not checked: interactions.** `INTERACTIONS` in `scripts/ui-audit.mjs` records
the controls each route must prove — search, filter, drag, submit — but no CDP
driver executes it, and `AUDIT_INTERACTIONS` is read by nothing. It is a written
spec, and the per-route files in `docs/screenshots/` describe it, not a passing
result. Implementing the driver is a real task; do not report these as verified
until it exists. `tests/ui-audit-bridge.test.mjs` keeps the spec's routes and the
audited routes in step.

## Honest coverage: what is not connected yet

Three areas render a labelled empty state rather than a number, because the host
does not export the measurement. They are specified, per field, in
`docs/HERMES-LOCAL-SETUP.md`:

- **Throughput, latency, error and token history** — the host exports a
  point-in-time snapshot only, so `live-mesh.ts` returns an empty series.
- **Per-agent load heatmap** — no load metric exists, so the grid is empty
  rather than 624 fabricated zero cells.
- **Health score** — no measurable definition exists, so `Agent.health` is
  `number | null` and renders `—`. `meshHealthScore()` returns `null` when no
  agent reported.
- **Resolved model and provider** — the host reports neither. `live-mesh.ts` sets
  both to `"unknown"` and `describeModel()` renders the em dash, so the roster
  cannot present an agent's card name as if it were a model.

`/notes` reads the real Hermes Obsidian vault read-only
(`lib/data/hermes-vault.ts`): the listing carries metadata only, a body is
served only for a path from that live listing, and an unreachable vault yields
an empty list with a reason — never invented notes.
