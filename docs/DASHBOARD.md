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
