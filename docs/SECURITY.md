# Security Policy — AnIm

The repository at `github.com/andypratama3/AnIm` is **public**. The agent mesh it
monitors is authenticated with real bearer tokens. This document is the contract
that keeps the two apart.

## Threat model

| Risk | Mitigation |
|---|---|
| A token is committed and pushed to public GitHub | `scripts/secret-scan.sh` blocks the commit; CI fails the push |
| The dashboard leaks a token by serving agent files | Filename allowlist (`*.md` only) in the SSH bridge; `.env`/`auth.json` are never readable |
| A token is pasted into a doc or commit message | Scanner runs on staged content, not just the worktree |
| Someone copies live agent config into the repo | `.gitignore` blocks `auth.json`, `*.pem`, `*.key`, `*.env*`, runtime state |
| A later change silently widens the bridge allowlist | Rule 2 in `AGENTS.md`; the allowlist is a single exported constant |

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
npm run verify                # scan + typecheck + lint + build
```

`.github/workflows/secret-guard.yml` runs on every push and pull request. It
performs two checks: the pattern scan, and a filename check that fails if any
credential-shaped file is tracked at all.

## The SSH bridge

`lib/data/remote.ts` is the only code path that touches the server. Its contract:

- **Read-only.** It runs a fixed set of commands over `ssh`; there is no write path.
- **Filename allowlist.** Only `SOUL.md`, `AGENTS.md`, `IDENTITY.md`, `TOOLS.md`,
  `USER.md`, `HEARTBEAT.md`, `constitution.md` and `obsidian/*.md` are fetchable.
  A requested name is rejected before the SSH call if it contains `/`, `..`, or is
  not on the list.
- **Bounded.** Every call has a timeout, an output size cap, and a fixed
  `BatchMode=yes` so it can never block on an interactive prompt.
- **Degrades, never blocks.** A bridge failure returns a typed `unavailable` state;
  the UI labels the degraded mode instead of pretending the data is live.
