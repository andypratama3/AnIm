<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AnIm — Operating Rules

Read this before doing anything in this repo. These rules are non-negotiable.

## 1. Hard rule: never build or deploy on the agent server

The agent mesh lives on a remote host **and the console is deployed on it** at
`/opt/anim-dashboard`. **Do not run `npm run build`, `next build`, `npm ci`,
`pnpm install`, or any deploy step on it. Do not restart gateways to "pick up a
change".** Authoritative builds happen locally, in this repo.

- Build/test/verify locally: `npm run verify`.
- `npm run dev` / `npm run start` pin `-H 127.0.0.1`. Next defaults to
  `0.0.0.0`, which would publish the console to the network; the page can reach
  the mesh, so keep it on loopback. nginx is the only public listener.
- The server is treated as **runtime + content only**. Writing agent markdown
  (SOUL.md and friends) is fine; building or restarting services is not.
- If a change appears to need a server-side build or a gateway restart, stop and
  ask the user first. Do not "just do it". Findings that need a server decision
  go in `docs/SERVER-DEFERRED.md` instead of being acted on.

## 2. Hard rule: no secrets, ever

This repo is pushed to a public GitHub remote. Nothing secret may enter it.

- Never read, copy, log, or commit `.env`, `auth.json`, `credentials.json`,
  `A2A_PEER_TOKENS`, `OPENROUTER_API_KEY`, `DISCORD_BOT_TOKEN`, or any `*.pem`/`*.key`.
- Never paste a real token into a doc, comment, commit message, or dashboard field.
  Masked hints only: `sk-or-v1-***`, `MTU0***`.
- The dashboard reads agent files over SSH with a **filename allowlist**
  (`*.md` only). `.env` and `auth.json` are never readable through it. Keep it that
  way — if you widen the allowlist, you are creating a leak.
- Guard tooling (all must stay in place):
  - `scripts/secret-scan.sh` — pattern scanner, run by pre-commit and CI.
  - `.git/hooks/pre-commit` — install with `scripts/install-hooks.sh`.
  - `.github/workflows/secret-guard.yml` — fails CI on leaks or tracked credential files.
  - `npm run scan:secrets` — manual full-tree scan.
- Before any commit: `npm run scan:secrets`. Before any push: `npm run verify`.

## 3. Remote access

- Host `72.61.141.91`, user `root`, key auth. Use `ssh -o BatchMode=yes root@72.61.141.91`.
- **The console is deployed on the mesh host** (`/opt/anim-dashboard`, nginx
  `hermes.andypratama.studio` → `127.0.0.1:3000`). It therefore runs with
  `ANIM_EXEC_MODE=local`: the collector, the `hermes` CLI and `127.0.0.1:<port>`
  are reached directly, and **no SSH channel is opened to itself**. SSH exists
  only for a laptop pointed at a remote host, and it fails closed without a key.
  Runtime secrets live in `/opt/anim-dashboard/.env.local` (mode 600, gitignored) —
  never read or print it; `ANIM_API_TOKEN` is the operator's login secret.
- Read-only by default. Writes require a fresh backup first, and never a build.
- Backing up before any remote change is mandatory:
  `/home/bor/.hermes.backup-anim-<timestamp>/`.
- **The mesh ports `9900`–`9925` are server-private.** A gateway must bind
  `127.0.0.1`, never `0.0.0.0`. The console dials them over loopback and needs
  nothing else. Before or after touching gateway startup, run
  `npm run check:ports` — it is read-only, audits this host in place, and exits
  non-zero if any of those ports is bound off-loopback or opened in the firewall.
  Never add an ingress rule for that range.

## 4. Dashboard quality bar

- No fake interactivity: every control does something real or is removed.
- Real data first. Synthetic fallback is a degraded mode, not the default, and the
  UI must label which mode it is in.
- Every route needs a real `<h1>`, a unique document title, and zero horizontal
  overflow at 1512px and 390px.
- `npx tsc --noEmit` clean, `npm run lint` zero errors, `npm run build` green
  before any change is considered done.

Detailed specs: `docs/DASHBOARD.md`, `docs/AGENT_MESH.md`, `docs/SECURITY.md`.
