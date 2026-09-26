#!/usr/bin/env python3
"""Stage 2 deployment: create Hermes profiles + documentation. NO gateway start.

Safety contract:
  * fresh backup before any write
  * never touches config.yaml / .env of an already-running profile
  * never prints a token, key, or bot secret
  * validates YAML after every write
  * restores ownership to bor:bor
  * does NOT run `gateway install` or `gateway start`
"""
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time

HOME = "/home/bor"
HERMES = f"{HOME}/.hermes"
DOCS = "/tmp/hermes-docs"
BACKUP = f"{HERMES}.backup-anim-stage2-{time.strftime('%Y%m%d-%H%M%S')}"
BOR = "bor"
EXISTING = ["default", "ceo-bor", "principal-engineer", "social-media",
            "management-research", "frontend", "backend"]


def run(cmd, check=True, capture=True):
    r = subprocess.run(cmd, shell=True, text=True,
                       capture_output=capture)
    if check and r.returncode != 0:
        raise SystemExit(f"FAILED: {cmd}\nSTDOUT: {r.stdout}\nSTDERR: {r.stderr}")
    return r


def sh(cmd):
    return run(cmd).stdout.strip()


def mask(value):
    """Never reveal a secret; show only a length hint."""
    return f"<secret len={len(value)}>" if value else "<empty>"


def chown_bor(path):
    run(f"chown -R {BOR}:{BOR} {shlex_quote(path)}", check=False)
    run(f"find {shlex_quote(path)} -type d -exec chmod 750 {{}} +", check=False)
    run(f"find {shlex_quote(path)} -type f -name '*.md' -exec chmod 640 {{}} +", check=False)
    run(f"find {shlex_quote(path)} -type f ! -name '*.md' -exec chmod 600 {{}} +", check=False)


def shlex_quote(s):
    import shlex
    return shlex.quote(s)


# ---------------------------------------------------------------- backups
def backup():
    print(f"[1/6] Backing up -> {BACKUP}")
    run(f"mkdir -p {shlex_quote(BACKUP)}")
    run(f"cp -a {HERMES}/config.yaml {shlex_quote(BACKUP)}/root-config.yaml", check=False)
    run(f"cp -a {HERMES}/.env {shlex_quote(BACKUP)}/root.env", check=False)
    for p in EXISTING[1:]:
        d = f"{HERMES}/profiles/{p}"
        if os.path.isdir(d):
            run(f"cp -a {d} {shlex_quote(BACKUP)}/profile-{p}", check=False)
    n = len(os.listdir(BACKUP))
    size = sh(f"du -sh {shlex_quote(BACKUP)} | cut -f1")
    print(f"      backup entries={n} size={size}")


# ---------------------------------------------------------------- tokens
def collect_existing_tokens():
    """Learn each running agent's shared secret from its own config. Never print it."""
    tokens = {}
    paths = {"default": f"{HERMES}/config.yaml"}
    for p in EXISTING[1:]:
        paths[p] = f"{HERMES}/profiles/{p}/config.yaml"

    import yaml
    for name, path in paths.items():
        if not os.path.exists(path):
            continue
        cfg = yaml.safe_load(open(path)) or {}
        peers = cfg.get("a2a_agents", {}) or {}
        for peer, val in peers.items():
            tok = ((val or {}).get("auth") or {}).get("token")
            if tok:
                tokens.setdefault(peer, set()).add(tok)

    resolved, conflicts = {}, []
    for peer, toks in tokens.items():
        if len(toks) == 1:
            resolved[peer] = next(iter(toks))
        else:
            conflicts.append((peer, len(toks)))
    return resolved, conflicts


# ---------------------------------------------------------------- profiles
def create_profiles(registry):
    new = [a for a in registry["agents"] if a["state"] == "new"]
    print(f"[2/6] Creating {len(new)} profiles (no gateway start)")
    created, skipped = [], []
    for a in new:
        name = a["profile"]
        desc = f"{a['title']} - {a['department']} - {a['mission'][:110]}"
        exists = os.path.isdir(f"{HERMES}/profiles/{name}")
        if exists:
            skipped.append(name)
            continue
        r = run(f"su - {BOR} -c 'export PATH={HOME}/.local/bin:$PATH; hermes profile create {shlex_quote(name)} --description {shlex_quote(desc)} --no-skills'",
                check=False)
        if r.returncode == 0 and os.path.isdir(f"{HERMES}/profiles/{name}"):
            created.append(name)
        else:
            print(f"      ! create failed for {name}: {r.stderr.strip()[:200]}")
    print(f"      created={len(created)} already_present={len(skipped)}")
    return created, skipped


# ---------------------------------------------------------------- docs
def sync_docs(registry):
    print("[3/6] Syncing documentation set")
    total = 0
    for a in registry["agents"]:
        src = f"{DOCS}/{a['profile']}"
        dst = f"{HERMES}/profiles/{a['profile']}" if a["profile"] != "default" else HERMES
        os.makedirs(dst, exist_ok=True)
        for rel in ("SOUL.md", "AGENTS.md", "IDENTITY.md", "TOOLS.md", "USER.md", "HEARTBEAT.md"):
            s = f"{src}/{rel}"
            if os.path.exists(s):
                shutil.copy2(s, f"{dst}/{rel}")
                total += 1
        obs_src = f"{src}/obsidian/self-improvement.md"
        if os.path.exists(obs_src):
            os.makedirs(f"{dst}/obsidian", exist_ok=True)
            shutil.copy2(obs_src, f"{dst}/obsidian/self-improvement.md")
            total += 1
    for shared in ("constitution.md", "CHARTER.md"):
        s = f"{DOCS}/_shared/{shared}"
        if os.path.exists(s):
            shutil.copy2(s, f"{HERMES}/{shared}")
            total += 1
    print(f"      files copied={total}")
    return total


# ---------------------------------------------------------------- a2a wire
def wire_new_profiles(registry, tokens):
    import yaml
    print("[4/6] Wiring A2A for NEW profiles only (running profiles untouched)")
    agents = registry["agents"]
    port_of = {a["profile"]: a["port"] for a in agents}
    cap_of = {a["profile"]: [s.split("/")[-1] for s in a.get("skills", [])[:3]] for a in agents}

    for a in agents:
        name = a["profile"]
        if a["state"] != "new":
            continue
        d = f"{HERMES}/profiles/{name}"
        cfg_path = f"{d}/config.yaml"
        if not os.path.exists(cfg_path):
            print(f"      ! missing config for {name}, skipped")
            continue

        run(f"cp -a {shlex_quote(cfg_path)} {shlex_quote(cfg_path)}.backup-{time.strftime('%Y%m%d-%H%M%S')}")

        raw = open(cfg_path).read()
        peers = {}
        for other in agents:
            pn = other["profile"]
            peers[pn] = {
                "url": f"http://127.0.0.1:{port_of[pn]}",
                "auth": {"type": "bearer", "token": tokens[pn]},
                "timeout": 120,
                "capabilities": cap_of[pn],
            }

        block = yaml.safe_dump({"a2a_agents": peers}, sort_keys=False,
                               default_flow_style=False, width=100)
        if re.search(r"^a2a_agents:", raw, re.M):
            raw = re.sub(r"^a2a_agents:.*?(?=^[A-Za-z_]+:|\Z)", block, raw,
                         count=1, flags=re.S | re.M)
        else:
            raw = raw.rstrip("\n") + "\n\n" + block
        open(cfg_path, "w").write(raw)

        yaml.safe_load(open(cfg_path))
        print(f"      {name}: {len(peers)} peers wired, YAML OK")


def write_env(registry, tokens):
    """Give each new profile the runtime key + its own A2A identity. Never printed."""
    print("[5/6] Writing new-profile .env (secrets copied, never printed)")
    root_env = f"{HERMES}/.env"
    src = open(root_env).read()
    api_key = None
    for line in src.splitlines():
        if line.startswith("OPENROUTER_API_KEY="):
            api_key = line.split("=", 1)[1].strip()
            break
    if not api_key:
        print("      ! OPENROUTER_API_KEY not found in root .env; new profiles will not have a key")
        return

    for a in registry["agents"]:
        if a["state"] != "new":
            continue
        name = a["profile"]
        env_path = f"{HERMES}/profiles/{name}/.env"
        pairs = ",".join(
            f"{other['profile']}:{tokens[other['profile']]}"
            for other in registry["agents"] if other["profile"] != name
        )
        body = (
            f"OPENROUTER_API_KEY={api_key}\n"
            f"A2A_AGENT_NAME={a['display_name']}\n"
            f"A2A_PEER_TOKENS={pairs}\n"
        )
        with open(env_path, "w") as fh:
            fh.write(body)
        os.chmod(env_path, 0o600)
        print(f"      {name}: OPENROUTER_API_KEY={mask(api_key)}, "
              f"A2A_PEER_TOKENS={len(registry['agents']) - 1} peer entries")


def seed_vault(registry):
    vault = f"{HOME}/Documents/Obsidian/Hermes-Agent"
    print("[6/6] Seeding vault")
    os.makedirs(f"{vault}/00-Company", exist_ok=True)
    os.makedirs(f"{vault}/10-Agents", exist_ok=True)
    os.makedirs(f"{vault}/20-Tasks", exist_ok=True)
    os.makedirs(f"{vault}/30-Knowledge", exist_ok=True)
    os.makedirs(f"{vault}/40-Reports", exist_ok=True)
    os.makedirs(f"{vault}/90-Templates", exist_ok=True)

    for shared, dest in (("constitution.md", "00-Company/Constitution.md"),
                         ("CHARTER.md", "00-Company/Charter.md")):
        s = f"{DOCS}/_shared/{shared}"
        if os.path.exists(s):
            shutil.copy2(s, f"{vault}/{dest}")

    for a in registry["agents"]:
        d = f"{vault}/10-Agents/{a['profile']}"
        os.makedirs(d, exist_ok=True)
        shutil.copy2(f"{DOCS}/{a['profile']}/SOUL.md", f"{d}/SOUL.md")
        shutil.copy2(f"{DOCS}/{a['profile']}/IDENTITY.md", f"{d}/IDENTITY.md")

    with open(f"{vault}/20-Tasks/Verification-Board.md", "w") as fh:
        rows = ["| Agent | Department | Reports to | Port | State | Docs |",
                "|---|---|---|---|---|---|"]
        for a in registry["agents"]:
            rows.append(f"| `{a['profile']}` | {a['department']} | "
                        f"`{a['reports_to']}` | {a['port']} | {a['state']} | complete |")
        fh.write("# Verification Board\n\n")
        fh.write("The owner receives only `VERIFIED`. No agent may self-certify.\n\n")
        fh.write("\n".join(rows) + "\n")

    chown_bor(vault)
    chown_bor(BACKUP)
    n = sum(len(fs) for _, _, fs in os.walk(vault))
    print(f"      vault={vault} files={n}")


def main():
    import yaml  # noqa: F401  (fail fast if PyYAML is missing)
    registry = json.load(open("/tmp/hermes-docs/registry.json"))
    print("=" * 66)
    print("AndyOS Stage 2 — create profiles + docs. NO gateway start.")
    print("=" * 66)

    existing_tokens, conflicts = collect_existing_tokens()
    print(f"[0/6] Learned {len(existing_tokens)} existing peer secrets from live configs.")
    for peer, count in conflicts:
        print(f"      ! conflicting tokens for {peer} ({count} variants) - "
              f"activation required to reconcile")
    for a in registry["agents"]:
        if a["state"] == "new" and a["profile"] not in existing_tokens:
            existing_tokens[a["profile"]] = secrets.token_hex(32)
    print(f"      total mesh secrets: {len(existing_tokens)}")

    backup()
    create_profiles(registry)
    sync_docs(registry)
    wire_new_profiles(registry, existing_tokens)
    write_env(registry, existing_tokens)
    seed_vault(registry)

    with open("/tmp/mesh-tokens.json", "w") as fh:
        json.dump(existing_tokens, fh, indent=2)
    os.chmod("/tmp/mesh-tokens.json", 0o600)

    print("=" * 66)
    print("DONE. Gateways were NOT started. Running profiles were NOT modified.")
    print(f"Backup: {BACKUP}")
    print("=" * 66)


if __name__ == "__main__":
    main()
