#!/usr/bin/env python3
"""AndyOS Stage 2b — finish profile creation, set descriptions, wire A2A.

No gateway is started. Running profiles are not modified.

Token model (verified against the live configs): a token is per *pair*.
`token[A][B]` is the secret A presents when calling B, and B accepts it from A.
That is why every live config carries a different token for the same peer.

Because fully admitting a new agent requires editing the running profiles'
config.yaml and .env, that part is prepared as an activation plan and is NOT
applied here. The new profiles are fully wired on their own side.
"""
import json
import os
import re
import secrets
import shutil
import subprocess
import time

import yaml

HOME = "/home/bor"
HERMES = f"{HOME}/.hermes"
DOCS = "/tmp/hermes-docs"
BOR = "bor"
EXISTING = ["default", "ceo-bor", "principal-engineer", "social-media",
            "management-research", "frontend", "backend"]
TOKEN_STORE = "/home/bor/.hermes/mesh-tokens.json"


def sh(cmd, check=True):
    r = subprocess.run(cmd, shell=True, text=True, capture_output=True)
    if check and r.returncode != 0:
        raise SystemExit(f"FAILED: {cmd}\n{r.stdout}\n{r.stderr}")
    return r.stdout.strip()


def q(s):
    import shlex
    return shlex.quote(s)


def mask(v):
    return f"<secret len={len(v)}>" if v else "<empty>"


# ------------------------------------------------------------------ 1
def fix_descriptions(registry):
    """hermes profile create left new profiles without a description."""
    print("[1/5] Setting profile descriptions")
    lines = ["#!/bin/sh", f"export PATH={HOME}/.local/bin:$PATH", "set -e"]
    for a in registry["agents"]:
        if a["state"] != "new":
            continue
        desc = f"{a['title']} | {a['department']} | reports to {a['reports_to']} | port {a['port']}"
        lines.append(f"hermes profile edit {q(a['profile'])} --description {q(desc)} "
                     f">/dev/null 2>&1 || true")
    path = "/tmp/set-desc.sh"
    open(path, "w").write("\n".join(lines) + "\n")
    os.chmod(path, 0o755)
    subprocess.run(["su", "-s", "/bin/sh", BOR, "-c", f"sh {path}"],
                   capture_output=True, text=True)
    ok = 0
    for a in registry["agents"]:
        if a["state"] != "new":
            continue
        p = f"{HERMES}/profiles/{a['profile']}/config.yaml"
        if os.path.exists(p):
            c = yaml.safe_load(open(p)) or {}
            if c.get("description"):
                ok += 1
    print(f"      descriptions present: {ok}/{len(registry['agents']) - len(EXISTING) + 0}")


# ------------------------------------------------------------------ 2
def load_or_build_tokens(registry):
    """Build the full symmetric pair-token matrix, reusing every live token."""
    print("[2/5] Building pair-token matrix")
    ids = [a["profile"] for a in registry["agents"]]
    matrix = {}
    if os.path.exists(TOKEN_STORE):
        matrix = json.load(open(TOKEN_STORE))
    else:
        matrix = {}

    reused = 0
    for caller, path in [("default", f"{HERMES}/config.yaml")] + [
            (p, f"{HERMES}/profiles/{p}/config.yaml") for p in EXISTING[1:]]:
        if not os.path.exists(path):
            continue
        cfg = yaml.safe_load(open(path)) or {}
        for peer, val in (cfg.get("a2a_agents") or {}).items():
            tok = ((val or {}).get("auth") or {}).get("token")
            if tok and peer in ids:
                matrix.setdefault(caller, {}).setdefault(peer, tok)
                reused += 1

    fresh = 0
    for a in ids:
        for b in ids:
            if a == b:
                continue
            if b not in matrix.setdefault(a, {}):
                matrix[a][b] = secrets.token_hex(32)
                fresh += 1

    os.makedirs(os.path.dirname(TOKEN_STORE), exist_ok=True)
    with open(TOKEN_STORE, "w") as fh:
        json.dump(matrix, fh, indent=2)
    os.chmod(TOKEN_STORE, 0o600)
    sh(f"chown {BOR}:{BOR} {TOKEN_STORE}")

    total = sum(len(v) for v in matrix.values())
    print(f"      pairs={total} reused_from_live={reused} generated={fresh}")
    print(f"      stored at {TOKEN_STORE} (mode 600, never printed)")
    return matrix


# ------------------------------------------------------------------ 3
def wire_new(registry, matrix):
    print("[3/5] Wiring A2A for the 19 new profiles")
    agents = registry["agents"]
    port_of = {a["profile"]: a["port"] for a in agents}
    cap_of = {a["profile"]: [s.split("/")[-1] for s in a.get("skills", [])[:3]] for a in agents}

    for a in agents:
        if a["state"] != "new":
            continue
        name = a["profile"]
        cfg_path = f"{HERMES}/profiles/{name}/config.yaml"
        if not os.path.exists(cfg_path):
            print(f"      ! {name}: no config.yaml, skipped")
            continue
        shutil.copy2(cfg_path, f"{cfg_path}.backup-{time.strftime('%Y%m%d-%H%M%S')}")

        peers = {}
        for other in agents:
            pn = other["profile"]
            if pn == name:
                continue
            peers[pn] = {
                "url": f"http://127.0.0.1:{port_of[pn]}",
                "auth": {"type": "bearer", "token": matrix[name][pn]},
                "timeout": 120,
                "capabilities": cap_of[pn],
            }
        block = yaml.safe_dump({"a2a_agents": peers}, sort_keys=False,
                               default_flow_style=False, width=100)
        raw = open(cfg_path).read()
        if re.search(r"^a2a_agents:", raw, re.M):
            raw = re.sub(r"^a2a_agents:.*?(?=^[A-Za-z_]+:|\Z)", block, raw,
                         count=1, flags=re.S | re.M)
        else:
            raw = raw.rstrip("\n") + "\n\n" + block
        open(cfg_path, "w").write(raw)
        yaml.safe_load(open(cfg_path))
        print(f"      {name:<22} {len(peers)} peers  YAML OK")


# ------------------------------------------------------------------ 4
def write_env(registry, matrix):
    print("[4/5] Writing new-profile .env")
    api_key = None
    for line in open(f"{HERMES}/.env").read().splitlines():
        if line.startswith("OPENROUTER_API_KEY="):
            api_key = line.split("=", 1)[1].strip()
            break
    if not api_key:
        print("      ! no OPENROUTER_API_KEY in root .env")
        return

    for a in registry["agents"]:
        if a["state"] != "new":
            continue
        name = a["profile"]
        # accept tokens from every caller
        accept = ",".join(
            f"{caller}:{matrix[caller][name]}"
            for caller in matrix if caller != name and name in matrix[caller]
        )
        body = (
            f"OPENROUTER_API_KEY={api_key}\n"
            f"A2A_AGENT_NAME={a['display_name']}\n"
            f"A2A_PEER_TOKENS={accept}\n"
        )
        p = f"{HERMES}/profiles/{name}/.env"
        with open(p, "w") as fh:
            fh.write(body)
        os.chmod(p, 0o600)
        print(f"      {name:<22} key={mask(api_key)} accepts={len(accept.split(','))} callers")


# ------------------------------------------------------------------ 5
def activation_plan(registry, matrix):
    """Record, but do not apply, the patches the running profiles need."""
    print("[5/5] Writing activation plan (NOT applied)")
    new = [a["profile"] for a in registry["agents"] if a["state"] == "new"]
    plan = {
        "purpose": "Add the 19 new agents to the 7 running profiles at activation time.",
        "requires": [
            "owner approval",
            "a fresh backup of every config.yaml and .env",
            "a gateway restart of the 7 running profiles",
            "at least 5.2 GB free RAM, or a staged batch plan",
        ],
        "not_applied_because": "The owner held gateway restarts and server builds.",
        "patch_per_running_profile": {
            p: {
                "add_peers": {n: f"http://127.0.0.1:{next(a['port'] for a in registry['agents'] if a['profile'] == n)}"
                              for n in new},
                "token_for_new_peer_n": f"token[{p}][{n}] in mesh-tokens.json",
            } for p in EXISTING
        },
    }
    path = f"{HERMES}/ACTIVATION-PLAN.json"
    with open(path, "w") as fh:
        json.dump(plan, fh, indent=2)
    os.chmod(path, 0o600)
    sh(f"chown {BOR}:{BOR} {path}")
    print(f"      {path}")


def main():
    registry = json.load(open(f"{DOCS}/registry.json"))
    print("=" * 66)
    print("AndyOS Stage 2b — descriptions, A2A wiring, env. NO gateway start.")
    print("=" * 66)
    fix_descriptions(registry)
    matrix = load_or_build_tokens(registry)
    wire_new(registry, matrix)
    write_env(registry, matrix)
    activation_plan(registry, matrix)

    for d in ("/home/bor/.hermes/profiles", "/home/bor/.hermes"):
        sh(f"chown -R {BOR}:{BOR} {d}")
    sh(f"chmod 700 {HERMES}")
    print("=" * 66)
    print("DONE. 26 profiles on disk, 7 gateways still untouched, 0 restarts.")
    print("=" * 66)


if __name__ == "__main__":
    main()
