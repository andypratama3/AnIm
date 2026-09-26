# Server work, deferred

Nothing in this file has been done. Every item needs a decision from the server
owner plus a fresh backup, and several of them should not be automated at all.
This document exists so the findings are not lost and nobody rediscovers them the
expensive way.

Recorded 2026-09-26. Every claim below was read from the host; nothing is inferred.

---

## 1. Do not run a blanket `pm2` clear on the Hermes host

This is the most dangerous item here, so it is first.

The agent mesh is **not** managed by PM2. The seven live gateways have
`systemd --user` (PID 1155, user `bor`) as their parent, so PM2 has no
relationship to them at all. Clearing PM2 would not stop the mesh — it would stop
three unrelated production websites.

`/root/.pm2` currently supervises:

| name | script | working directory | listening |
|---|---|---|---|
| `magic-portfolio` | `/usr/bin/npm` | `/var/www/magic-portfolio` | — |
| `my-ismiiiyyyy` | `/usr/bin/npm` | `/var/www/my-ismiiiyyyy` | — |
| `landing-nextjs` | `.../landing_sdmuhammadiyah3/node_modules/next/dist/bin/next` | `/var/www/sdmuhammadiyah3smd.com/landing_sdmuhammadiyah3` | `*:3001` (pid 1366) |

`landing-nextjs` is a real site behind nginx on `80`/`443`
(`sdmuhammadiyah3smd.com`). `pm2 kill all` or `pm2 delete all` as root would take
it offline. None of these three belong to AnIm, and none were created by this
project.

`/home/bor/.pm2` is the opposite case: an empty process list and a 2-byte
`dump.pm2`, i.e. only a stale daemon from earlier mesh work. That one is safe to
stop, and it is also the only part of PM2 that was ever ours.

**If PM2 on the host must be cleaned, name the process explicitly.** Do not use
the wildcard forms.

## 2. A stopped gateway is not an unusable profile

The dashboard says "19 installed, stopped", and the TCP probe agrees: nothing
listens on `9907`–`9925`. But `hermes -p frontend` answers normally.

So "stopped" describes a **listening gateway**, not a profile you cannot talk to.
The CLI addresses a profile directly and does not need its port open. Two
consequences:

- The dashboard's wording is defensible, but "19 offline" would be wrong. It
  currently says stopped, which is correct — keep it.
- Any liveness check built on "is the port open" answers a different question
  than "can this agent be reached". Do not let the two get conflated in a metric.

## 3. The 19 stopped gateways need a capacity decision

All 26 profiles are configured; 7 hold `9900`–`9906` and 19 are assigned
`9907`–`9925`. RAM does not allow all 26 at once. Starting them is a capacity
and memory decision for the owner, not a code change, and the ingress side must
be re-checked afterwards with `npm run check:ports`.

The dashboard shows `0/19` reachability, which is honest for the gateway ports but
is not the same as saying those agents are unusable. See item 2.

## 4. Port assignments come from the registry, and 19 profiles have none

`lib/data/remote-probe.ts` used to carry its own copy of the profile-to-port
table while `agents/registry.json` is the canonical one. The two disagreed, and
the probe answered for the copy. That duplicate is gone: the probe now reads
`lib/data/registry.ts`, which loads the registry, and `tests/registry-ports.test.mjs`
fails if a second table reappears.

Two facts about the data itself are still the server owner's call:

- The registry assigns ports to 7 profiles. The other 19 have no port recorded,
  so the probe reports `no port assigned in the registry` for them instead of
  guessing. The 19 stopped gateways discussed above are the same set. Assigning
  those ports is a registry edit on the host, not something the dashboard can
  decide.
- If the registry on the host disagrees with the live systemd units, a collision
  at startup is how two agents end up answering on the same socket. Confirm which
  profile owns which port before the next gateway restart.

## 5. Remote vault holds 4 of 26 documents

Per-agent document presence is read over SSH through a `*.md` filename allowlist.
Four of 26 profiles have their document set. Writing the rest means creating
content on the host, which needs the backup step in `AGENTS.md` and a decision
about what each agent's documents should say. Not automatable from here.

## 6. Hierarchy conflict: `ceo-bor`

`agents/registry.json` reports to Andy; the charter file places it under
`agent-secretary`. One of the two is wrong. This is a content decision about the
org chart, and the dashboard renders the registry, so the registry was left alone
until the owner decides.

## 7. Live SSH bridge from CI returns 503

The GitHub runner cannot always reach the host, so the live mesh check has no
fixture to assert against and degrades to synthetic. This is a CI reachability
problem, not a product defect, and it is the reason a "live" badge can be
synthetic in a build. Needs either a runner with egress to the host or a
recorded fixture.

---

## Safe to run without a decision

```
npm run check:ports        # read-only, local, verifies the ports stay private
```

## Requires a decision and a backup

Everything in sections 1–7. Per `AGENTS.md`: back up to
`/home/bor/.hermes.backup-anim-<timestamp>/` first, and never build, install, or
restart a gateway to "pick up a change".
