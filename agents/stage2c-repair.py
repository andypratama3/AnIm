#!/usr/bin/env python3
"""Stage 2c — repair the two profiles whose create failed, and set descriptions.

No gateway is started. No running profile is modified.
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
TOKEN_STORE = f"{HERMES}/mesh-tokens.json"
REGISTRY = "/home/bor/.hermes/registry.json"


def sh(cmd, check=True):
    r = subprocess.run(cmd, shell=True, text=True, capture_output=True)
    if check and r.returncode != 0:
        raise SystemExit(f"FAILED: {cmd}\n{r.stdout}\n{r.stderr}")
    return r.stdout.strip()


def recreate(registry, broken):
    print("[1/4] Recreating profiles whose config.yaml was never written")
    for a in broken:
        name = a["profile"]
        d = f"{HERMES}/profiles/{name}"
        if os.path.isdir(d):
            shutil.rmtree(d)
        print(f"      removing partial {name}")
    lines = ["#!/bin/sh", f"export PATH={HOME}/.local/bin:$PATH", "set -e"]
    for a in registry["agents"]:
        if a["state"] != "new":
            continue
        desc = f"{a['title']} - {a['department']} - port {a['port']}"
        lines.append(
            f"hermes profile create {a['profile']} --no-skills "
            f"--description \"{desc}\" >/dev/null 2>&1 || true"
        )
    p = "/tmp/recreate.sh"
    open(p, "w").write("\n".join(lines) + "\n")
    os.chmod(p, 0o755)
    r = subprocess.run(["su", "-s", "/bin/sh", BOR, "-c", f"sh {p}"],
                       capture_output=True, text=True)
    print(f"      recreate exit={r.returncode}")

    ok = []
    for a in registry["agents"]:
        if a["state"] != "new":
            continue
        c = f"{HERMES}/profiles/{a['profile']}/config.yaml"
        if os.path.exists(c):
            try:
                yaml.safe_load(open(c))
                ok.append(a["profile"])
            except Exception:
                pass
    print(f"      profiles with valid config.yaml: {len(ok)}")
    return ok


def describe(registry):
    print("[2/4] Setting descriptions via `hermes profile describe`")
    lines = ["#!/bin/sh", f"export PATH={HOME}/.local/bin:$PATH", "set -e"]
    for a in registry["agents"]:
        if a["state"] != "new":
            continue
        desc = f"{a['title']} - {a['department']} - reports to {a['reports_to']} - port {a['port']}"
        lines.append(
            f"hermes profile describe {a['profile']} \"{desc}\" >/dev/null 2>&1 || true"
        )
    p = "/tmp/describe.sh"
    open(p, "w").write("\n".join(lines) + "\n")
    os.chmod(p, 0o755)
    subprocess.run(["su", "-s", "/bin/sh", BOR, "-c", f"sh {p}"],
                   capture_output=True, text=True)
    have = 0
    for a in registry["agents"]:
        if a["state"] != "new":
            continue
        c = f"{HERMES}/profiles/{a['profile']}/config.yaml"
        if os.path.exists(c) and (yaml.safe_load(open(c)) or {}).get("description"):
            have += 1
    print(f"      descriptions set: {have}/19")


def rewire(registry, matrix):
    print("[3/4] Re-wiring every new profile (idempotent)")
    agents = registry["agents"]
    port_of = {a["profile"]: a["port"] for a in agents}
    cap_of = {a["profile"]: [s.split("/")[-1] for s in a.get("skills", [])[:3]] for a in agents}
    wired = 0
    for a in agents:
        if a["state"] != "new":
            continue
        name = a["profile"]
        cfg_path = f"{HERMES}/profiles/{name}/config.yaml"
        if not os.path.exists(cfg_path):
            print(f"      ! {name}: still no config.yaml")
            continue
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
        wired += 1
    print(f"      wired={wired}/19")

    # refresh .env accept-lists for the recreated profiles
    api_key = None
    for line in open(f"{HERMES}/.env").read().splitlines():
        if line.startswith("OPENROUTER_API_KEY="):
            api_key = line.split("=", 1)[1].strip()
            break
    if api_key:
        for a in agents:
            if a["state"] != "new":
                continue
            name = a["profile"]
            accept = ",".join(
                f"{c}:{matrix[c][name]}" for c in matrix
                if c != name and name in matrix.get(c, {})
            )
            with open(f"{HERMES}/profiles/{name}/.env", "w") as fh:
                fh.write(
                    f"OPENROUTER_API_KEY={api_key}\n"
                    f"A2A_AGENT_NAME={a['display_name']}\n"
                    f"A2A_PEER_TOKENS={accept}\n"
                )
            os.chmod(f"{HERMES}/profiles/{name}/.env", 0o600)
        print("      .env accept-lists refreshed")


def activation_plan(registry, matrix):
    print("[4/4] Writing activation plan (recorded, NOT applied)")
    new = [a["profile"] for a in registry["agents"] if a["state"] == "new"]
    port_of = {a["profile"]: a["port"] for a in registry["agents"]}
    per_profile = {}
    for p in EXISTING:
        per_profile[p] = {
            "add_peers": {n: f"http://127.0.0.1:{port_of[n]}" for n in new},
            "token_source": f"{TOKEN_STORE} -> matrix['{p}'][peer]",
        }
    plan = {
        "purpose": "Admit the 19 new agents into the 7 running profiles at activation time.",
        "mesh_size_after": len(registry["agents"]),
        "requires": [
            "explicit owner approval",
            "fresh backup of every config.yaml and .env involved",
            "gateway restart of the 7 running profiles (config is read at startup)",
            "free RAM: about 5.2 GB for all 26, or a staged batch of 4-5 at a time",
        ],
        "not_applied_because": "The owner held gateway restarts and any server-side build.",
        "token_model": "token[caller][callee]; the value is the secret the caller presents.",
        "patch_per_running_profile": per_profile,
        "verify_after": [
            "each profile lists 25 peers",
            "each profile's A2A port answers GET /.well-known/agent.json",
            "hermes -p <profile> chat can reach a peer in another department",
        ],
    }
    path = f"{HERMES}/ACTIVATION-PLAN.json"
    with open(path, "w") as fh:
        json.dump(plan, fh, indent=2)
    os.chmod(path, 0o600)
    print(f"      {path} (mode 600)")


def main():
    registry = json.load(open(REGISTRY))
    matrix = json.load(open(TOKEN_STORE))
    print("=" * 66)
    print("AndyOS Stage 2c — repair + describe. NO gateway start.")
    print("=" * 66)

    broken = [a for a in registry["agents"]
              if a["state"] == "new"
              and not os.path.exists(f"{HERMES}/profiles/{a['profile']}/config.yaml")]
    print(f"      broken profiles: {[a['profile'] for a in broken]}")
    if broken:
        recreate(registry, broken)
    describe(registry)
    rewire(registry, matrix)
    activation_plan(registry, matrix)

    sh(f"chown -R {BOR}:{BOR} {HERMES}")
    sh(f"chmod 700 {HERMES}")
    print("=" * 66)
    print("DONE.")
    print("=" * 66)


if __name__ == "__main__":
    main()
