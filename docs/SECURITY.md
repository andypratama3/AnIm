# Security Policy — AnIm

The repository at `github.com/andypratama3/AnIm` is **public**. The agent mesh it
monitors is authenticated with real bearer tokens. This document is the contract
that keeps the two apart.

## Threat model

| Risk | Mitigation |
|---|---|
| A token is committed and pushed to public GitHub | `scripts/secret-scan.sh` blocks the commit; CI fails the push |
| The dashboard leaks agent content by serving its files | The collector stats the `*.md` allowlist and returns presence and size only; no body is read or emitted |
| A token is pasted into a doc or commit message | Scanner runs on staged content, not just the worktree |
| Someone copies live agent config into the repo | `.gitignore` blocks `auth.json`, `*.pem`, `*.key`, `*.env*`, runtime state |
| A later change starts returning file bodies | `DOC_ALLOWLIST` in `scripts/mesh-inventory.py` is a stat list; the collector docstring states it is not a read list |
| The bridge is pointed at a shell with interpolated input | `execFile` argv arrays only; the SSH branch keeps `BatchMode=yes` |

## Forbidden, always

- Reading, copying, logging, or committing: `.env`, `auth.json`, `credentials.json`,
  `A2A_PEER_TOKENS`, `A2A_AGENT_TOKEN`, `OPENROUTER_API_KEY`, `DISCORD_BOT_TOKEN`,
  `GITHUB_TOKEN`, `HF_TOKEN`, `SLACK_*`, `TELEGRAM_BOT_TOKEN`, `*.pem`, `*.key`.
- Printing a full token into any tool output that ends up in a transcript or file.
- Serving agent files to the browser by anything other than the `*.md` allowlist.
- Writing back to the remote from the dashboard. The bridge is **read-only by design**.

If a secret ever reaches a commit: rotate the secret on the server first, then
rewrite the history. Rewriting without rotating leaves the secret live.

## Masked hints are allowed

Documentation may reference a credential by shape, never by value:

```
OPENROUTER_API_KEY=sk-or-v1-***
DISCORD_BOT_TOKEN=MTU0***
```

The scanner requires 10+ characters after a provider prefix before it fires, so
these pass. That is intentional — a masked hint is useful, a prefix is not.

## Guard tooling

```bash
npm run scan:secrets          # full worktree scan
scripts/secret-scan.sh        # staged only (what pre-commit runs)
scripts/secret-scan.sh --all  # tracked + untracked, non-ignored
./scripts/install-hooks.sh    # install .git/hooks/pre-commit
npm run verify                # scan + typecheck + lint + tests + build
```

`.github/workflows/secret-guard.yml` runs on every push and pull request. It
performs two checks: the pattern scan, and a filename check that fails if any
credential-shaped file is tracked at all.

## The mesh bridge

`lib/data/exec-host.ts` is the only code path that decides where mesh calls run.
Its contract:

- **Read-only.** It runs a fixed set of commands; there is no write path.
- **Local by default on the mesh host.** The production deployment sets
  `ANIM_EXEC_MODE=local`, so the collector, the `hermes` CLI and
  `127.0.0.1:<port>` are reached directly and **no SSH channel is opened**. That
  removes a privileged channel rather than adding one: the previous SSH hop ran
  from the mesh host back to itself and failed with
  `Permission denied (publickey,password)`, because root holds an
  `authorized_keys` and no private key.
- **SSH still supported, never implicit.** `ANIM_EXEC_MODE=ssh` (or `auto` on a
  host that does not hold the mesh) uses the fixed target from
  `ANIM_SSH_HOST`. It keeps `BatchMode=yes`, so a missing key fails closed
  instead of blocking on a prompt.
- **No agent file body is ever returned.** `scripts/mesh-inventory.py` holds a
  `DOC_ALLOWLIST` — `SOUL.md`, `AGENTS.md`, `IDENTITY.md`, `TOOLS.md`,
  `USER.md`, `HEARTBEAT.md`, `constitution.md`, plus a count of
  `obsidian/*.md` — and it **stats** each one, reporting presence and byte size
  only. Contents are not read, not parsed, and not emitted, so there is no
  request a caller could make to obtain one. `.env` and `auth.json` are not on
  the list and are never opened.
- **Bounded.** Every call has a timeout, an output size cap, and the local branch
  pins `HOME` so profile paths resolve identically under any starting account.
- **No shell.** Calls go through `execFile` with an argv array. The prompt is one
  argv entry, so nothing is word-split, globbed, or expanded.
- **Degrades, never fabricates.** A bridge failure returns a typed `unavailable`
  state; the UI labels the degraded mode instead of pretending the data is live.

## Runtime secrets

`/opt/anim-dashboard/.env.local` holds `ANIM_API_TOKEN` and the transport mode.
It is mode 600 and gitignored (`.gitignore` blocks `.env*` except the example).
Do not read it into a transcript, and do not print `ANIM_API_TOKEN` into tool
output — the operator reads it on the host to paste into the login field.

