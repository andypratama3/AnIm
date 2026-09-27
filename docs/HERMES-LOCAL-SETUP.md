# Connecting the console fully to Hermes — what must run on the host

This is the handover list for the remaining work. Everything here is about the
**Hermes side**; the console code is already in place and labelled for it.

Read this first: [Truth rules](./DASHBOARD.md#truth-rules-non-negotiable) and
[What the topology draws](./DASHBOARD.md#what-the-topology-draws).
A field renders `—` when the host does not export it. That is not a UI bug and
it is not something to "fix" in the console — each one is a gap on the host, and
this file is the list of gaps.

## Status summary

Measured from the live host on 2026-09-27 (26 profiles, 7 gateways running):

| Area | Source | State |
|---|---|---|
| Roster, status, ports, peers, doc presence | `mesh-inventory.py` | connected |
| Chat turns | `hermes -p <id> -z <prompt>` | connected |
| A2A probe | HTTP to the gateway port | connected |
| Kanban board | `hermes kanban list --json` | connected (read + create + complete) |
| Owner review queue | `.data/review-queue.json` | connected, file-backed |
| Activity feed | task transitions + chat transcripts | connected |
| **Throughput / latency / error / token history** | — | **not exported by the host** |
| **Per-agent load (heatmap)** | — | **not exported by the host** |
| **Health score** | — | **no measurable definition exists** |
| **Notes** | `SEED_NOTES` | **placeholder, labelled in the UI, not the real vault** |
| **Hierarchy** | `agents/registry.json` in this repo | **a repo copy, not read from Hermes** |

---

## 1. Export a metrics history from the host

The single biggest gap. `lib/data/live-mesh.ts` now returns an **empty** series
instead of invented numbers, so `/analytics` correctly shows its empty state.
It will stay empty until the host exports history.

**On the host**, write a rolling history alongside the other collector output.
One file per metric family is fine; append-only JSONL is the easiest to read and
truncate:

```
/home/bor/.hermes/mesh-metrics.jsonl
```

Required fields, per sample:

```json
{"ts": 1790459879730, "agent": "default", "throughput": 0, "latencyMs": 0, "errors": 0, "tokens": 0, "load": 0}
```

Rules that matter:

- `ts` in **milliseconds** (the console reads `created_at` style epochs but
  expects ms for series labels — match the collector's existing convention and
  document it).
- Use `null`, not `0`, for anything you did not measure. A `0` here becomes
  "0 errors" in the UI, which is a claim you cannot support.
- Rotate or cap the file. The console reads one series per agent; a multi-week
  file will be slow to parse on every poll.

**Then**, in `mesh-inventory.py`, add a `history` key to the emitted JSON, and in
`lib/data/live-mesh.ts` replace `noSeries()` with the parsed rows. The
`Series` type in `lib/types.ts` already carries `labels`, `throughput`,
`latency`, `errors`, `tokens` and `resolutionSec` — fill those, and leave
`synthetic: false`.

The heatmap needs `HeatCell[]` (`agent`, `hour`, `load`) from the same source.
`heatFromInventory()` currently returns `[]`; the comment there explains why it
must stay empty until a load metric exists.

**Verify:** `curl -s localhost:3000/api/mesh | jq '.series.throughput | length'`
should be a number greater than zero, and `.heat | length` should match
`agents * 24` only once load is real.

## 2. Decide what "health" means, or leave it null

`Agent.health` is now `number | null` and renders `—`. The old values
(100 / 85 / 55 / 0) were a hand-picked ladder, not a measurement, so they are
gone. Either:

- define a real score the host can compute (for example success rate over the
  last N completed A2A calls) and export it in the collector, or
- leave it `null` permanently and drop the health row from the drawer and the
  analytics table.

Do not reintroduce a constant. `tests/unmeasured-metrics.test.mjs` will fail if a
fabricated default comes back.

## 3. Notes should read the real vault

`lib/data/vault.ts` exports `SEED_NOTES` and `/api/notes` serves them, so the
content is invented. It is **labelled**: the route returns
`source: { kind: "local", persisted: false, sharedWithAgents: false }`, and the
page description says the notes live in the dashboard process only, are not
written to disk, and are gone on restart. A dead "New note" button that created
nothing has been removed rather than left as a control that lies.

That labelling is the honest floor, not the destination. On the host, decide the
source of truth — `hermes vault list` or the files under `/home/bor/.hermes/` —
then replace the seed in `/api/notes` with a read, using the same `exec-host`
bridge and the same read-only posture as the collector. Keep `VAULT_FOLDERS` as a
UI affordance while the contents are seeded, but do not let the folder names
imply the notes came from Hermes when they did not. If a real reader lands, the
page label has to change with it.

## 4. Hierarchy should come from Hermes

`readHierarchy()` reads `agents/registry.json` **from this repository**
(34 KB, committed). It is a hand-maintained copy, so it drifts from the real
profile set. Either:

- have the collector emit the real tree and prefer it, falling back to the
  committed registry only when the bridge is down, and say which is in use, or
- generate `registry.json` from the host as part of deploy.

The fallback must be labelled. Silently preferring a stale committed copy is the
same class of defect as the fabricated series.

## 5. Start the remaining gateways (optional, your call)

19 of 26 registry entries are `state: "new"`: no port assigned, so they show an
em dash wherever a port belongs, and their rows report whatever the collector
finds — `installed` if the profile directory is there with a stopped gateway,
`missing` if it is not. That is honest, but if you want a populated console the
gateways have to run and the registry needs ports for them. The collector
already reports the real state; nothing in the console needs to change.

`9907`–`9925` is reserved and currently unallocated, so assigning those ports is
a deliberate step with a capacity check attached. Do not start a gateway on the
agent server without an explicit decision — rule 1 in `AGENTS.md`.

Note the interaction with §1: more running gateways means more real history, but
only once §1 exists.

## 6. SSH key for the laptop path (only if you run the console off-host)

On this host the console uses `ANIM_EXEC_MODE=local` and never uses SSH. If you
run the console from a laptop against this host, `auto` mode will try SSH and
fail, because root here holds an `authorized_keys` entry but no private key.

On the **laptop**:

```bash
ssh-keygen -t ed25519 -C "anim-console" -f ~/.ssh/anim_console
```

On the **host**, add the public key to root's authorized_keys, then verify:

```bash
ssh -i ~/.ssh/anim_console root@72.61.141.91 'hostname'
```

The console's SSH branch already runs with `BatchMode=yes` and
`StrictHostKeyChecking=accept-new`, so a missing key fails closed instead of
hanging on a prompt.

For the laptop, set `ANIM_EXEC_MODE=auto` and point `ANIM_SSH_HOST` at the host.

## 7. Local `.env.local` for a laptop checkout

Never copy the production token. The file is gitignored (`*.local`):

```
ANIM_API_TOKEN=<generate your own: openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48>
ANIM_EXEC_MODE=auto
ANIM_SSH_HOST=root@72.61.141.91
ANIM_SSH_TIMEOUT_MS=12000
ANIM_PROBE_TIMEOUT_MS=15000
ANIM_CHAT_TIMEOUT_MS=180000
ANIM_CHAT_RATE_LIMIT=6
ANIM_CHAT_RATE_WINDOW_MS=60000
ANIM_CHAT_MAX_CONCURRENT=2
ANIM_CHAT_MAX_MESSAGES=200
```

`ANIM_GATEWAY_URLS` is only read by the offline simulated fallback and is not
needed on a laptop. `ANIM_CHAT_STORE` and `ANIM_TASK_STORE` relocate the
process-local JSON files under `.data/` — useful when `/opt/anim-dashboard` and a
checkout share a machine, and the reason those files are not state a restart
destroys by surprise. `.env.example` is the authoritative list.

Confirm it is ignored before you ever commit:

```bash
git check-ignore -v .env.local
```

`scripts/token-check.mjs` compares a candidate against the configured token and
tells you the first wrong position, without printing the secret. It needs
`ANIM_API_TOKEN` in the environment or `.env.local` present.

## 8. Toolchain on the laptop

- Node **22+** (this host runs v22.23.2; the build needs it)
- npm 12+
- `google-chrome` on `PATH` for `npm run audit:ui` (this host: `/usr/bin/google-chrome`)

```bash
npm ci
npm run dev          # or build + start for a production-shaped run
npm test             # the full suite, including the honesty regressions
npx tsc --noEmit
npm run lint
npm run scan:secrets
bash scripts/check-port-exposure.sh
npm run audit:ui     # needs a reachable server and a token in .env.local
```

## 9. Streaming chat: the honest position

**Current state:** the console calls `hermes -p <id> -z <prompt>`. `-z`
**buffers its entire output** and emits it in one burst at the end, so the
console cannot stream tokens from it. There is no `--stream` flag. A turn
therefore shows real progress up to the call and then the whole reply, and the
UI does not animate a typing effect that is not happening.

`hermes chat --format stream-json` does emit real incremental events, and the
console can consume them. Observed locally:

```
[ 2.24s] {"type":"system","subtype":"init","model":"...","session_id":"..."}
[25.46s] {"type":"tool_use","name":"browser_exec",...}
[64.14s] {"type":"tool_result","name":"browser_exec",...}
[66.67s] {"type":"text","text":"..."}
[73.19s] {"type":"result","tokens":{...}}
```

So tool activity, model and session are live well before the text arrives. The
assistant text itself still tends to land in a single `text` event, so this
gives genuine progress reporting — **not** token-by-token typing, and the UI
should not fake that.

The A2A gateways advertise `"streaming": true` on
`http://127.0.0.1:9900/.well-known/agent.json`, but every call returns
**401** without a bearer token. The token is `A2A_BEARER_TOKEN` in the gateway
process environment. If you want the console to call A2A directly for true
token streaming, that means giving a web application the agents' bearer
credential — a deliberate privilege grant, not something to enable by accident.
Until that is decided, `hermes chat --format stream-json` over the existing
local bridge is the right path: no new credential, same process, real events.

## 10. Before you push

The remote is a **public** repository (`github.com/andypratama3/AnIm`, branch
`main`).

```bash
npm run scan:secrets     # must report clean
git status --short        # confirm .env.local is NOT listed
git check-ignore -v .env.local
```

Never commit a token, a bearer credential, or a host inventory containing
private paths. `docs/SECURITY.md` has the full list.

---

## Where the console deliberately refuses to help

Some things the UI used to do are now explicit refusals rather than silent
inventions. They are intentional; do not "fix" them by faking the data.

- **Moving a task between mid-flight columns** returns `409` with an
  explanation. Hermes has no "set status" verb — its dispatcher and workers move
  tasks themselves. Only `done` maps to a real verb (`hermes kanban complete`).
- **Deleting a task** returns `405`. Hermes supports archive, not delete, and the
  board is the system of record for work in flight.
- **Unmeasured metrics** render `—`. See the table at the top of this file for
  what to export to fill them.
