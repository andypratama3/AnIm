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
| `/activity` | Event stream, pause/show-all | `/api/activity` |
| `/kanban` | Work board, `?new=1` deep link to compose | `/api/board` |
| `/analytics` | Tables and charts | `/api/mesh` |
| `/discussion` | Per-agent chat and the owner review queue | `/api/agent-chat` |
| `/notes` | Vault view | `/api/notes` |
| `/settings` | Preferences | local |

Every route needs a real `<h1>`, a unique document title, and zero horizontal
overflow at **1512px** and **390px**.

## Live bridge

`lib/data/remote.ts` runs `scripts/mesh-inventory.py` on the Hermes host over
SSH and returns a typed snapshot.

- Fixed host, user and script path. No caller-supplied command.
- `BatchMode=yes`, hard timeouts, 512 KB output ceiling, JSON validated before use.
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
- The agent is **not** given prior turns as context; `hermes -p` is a one-shot
  call. The transcript is an audit log, not agent memory, and the UI does not
  claim otherwise.

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
public deployment.**

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
used deliberately: the bridge is an on-demand SSH collect, so a websocket would
add a long-lived privileged channel for no gain.

Polling refreshes what the host reports. It does not make a stopped gateway run —
7 gateways are live and 19 are installed but stopped, and the UI says so.

## Ports

Each agent owns one port, `9900`–`9925`, unique with no gaps. Seven existing
gateways hold `9900`–`9906`; the 19 new profiles are configured for
`9907`–`9925` but are **not started**. Do not start them on the agent server
without an explicit decision and a capacity check.

**The mesh range is server-private and must stay that way.** A gateway binds
`127.0.0.1`, never `0.0.0.0`. The ports carry agent cards and peer material, and
nothing outside the host needs to reach them: the dashboard reads them over SSH,
and the browser only ever talks to its own Next server. The host also runs
`iptables` with `INPUT` policy `DROP`, opening just `22`, `80`, `443` and `icmp`.

Verify it at any time — read-only, no writes to the server:

```
npm run check:ports
```

It exits non-zero if any mesh port binds a non-loopback address, or if a
firewall rule opens the range. A future gateway started with the wrong bind
address is the realistic way this breaks, and that is the case the check exists
to catch.

Note that a port being closed does not mean the profile is unusable: the
`hermes -p <profile>` CLI can address a profile whose gateway is not listening,
so "19 stopped" describes the gateways, not the profiles.

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
npm run verify      # secret scan + tsc + eslint --max-warnings=0 + build
npm run audit:ui    # needs a served app; fails on overflow, clipping, console errors
```

`npm run audit:ui` aborts with a non-zero exit if any route failed to render, so
a dead server can never be mistaken for a clean run. Screenshots land in
`/tmp/anim-audit` and are uploaded as CI artifacts.
