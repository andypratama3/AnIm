#!/usr/bin/env python3
"""Read-only mesh inventory for the AnIm dashboard.

Invoked by lib/data/remote.ts, over whichever transport lib/data/exec-host
picks: directly on the mesh host in production, over SSH from a laptop.
Prints one JSON object on stdout.

This script is STRICTLY READ-ONLY:
  * it opens no file for writing
  * it reads no .env, no auth.json, no credential, no *.key / *.pem
  * it prints no token, no API key, no bot secret
  * it only inspects hermes profile directories, config.yaml public fields,
    gateway process state, and listening A2A ports

DOC_ALLOWLIST is a *presence* allowlist, not a read allowlist: it stats those
files and reports their size. No document body is ever read or returned, so
there is no path by which agent content reaches the browser.
"""
import json
import os
import re
import socket
import subprocess
import time

HOME = "/home/bor"
HERMES = f"{HOME}/.hermes"
PROFILES_DIR = f"{HERMES}/profiles"
VAULT = f"{HOME}/Documents/Obsidian/Hermes-Agent"
DOC_ALLOWLIST = {
    "SOUL.md", "AGENTS.md", "IDENTITY.md", "TOOLS.md", "USER.md",
    "HEARTBEAT.md", "constitution.md",
}
MAX_DOC_BYTES = 64 * 1024


def read_config(path):
    """Parse config.yaml without PyYAML so no import side effects are needed."""
    out = {}
    if not os.path.exists(path):
        return out
    try:
        import yaml
        with open(path) as fh:
            data = yaml.safe_load(fh) or {}
        if isinstance(data, dict):
            out = data
    except Exception:
        pass
    return out


def gateway_states():
    """Per-profile gateway state.

    A gateway serves A2A on its port, so the *authoritative* signal is the
    listening socket. gateway_state.json is a useful cross-check. Process
    scanning via `ps -p <profile>` is unreliable because the gateway is
    launched by a supervisor, not with an explicit -p flag.
    """
    states = {}
    try:
        entries = os.listdir(PROFILES_DIR) if os.path.isdir(PROFILES_DIR) else []
    except OSError:
        entries = []
    for prof in ["default"] + sorted(entries):
        base = HERMES if prof == "default" else f"{PROFILES_DIR}/{prof}"
        gspath = os.path.join(base, "gateway_state.json")
        info = {"processRunning": False, "state": None, "a2a": None,
                "codeVersion": None, "startedAt": None}
        if os.path.exists(gspath):
            try:
                with open(gspath) as fh:
                    gs = json.load(fh)
                info["processRunning"] = gs.get("pid") is not None or gs.get("running") is True
                info["state"] = gs.get("state") or gs.get("gateway_state")
                plats = gs.get("platforms") or {}
                info["a2a"] = (plats.get("a2a") or {}).get("state")
                info["codeVersion"] = gs.get("code_version")
                info["startedAt"] = gs.get("started_at") or gs.get("startedAt")
            except Exception:
                pass
        states[prof] = info
    return states


def listening_ports():
    ports = set()
    try:
        ss = subprocess.run(["ss", "-tlnp"], capture_output=True, text=True,
                            timeout=5).stdout
    except Exception:
        return ports
    for line in ss.splitlines():
        m = re.search(r":(99\d\d)\s", line + " ")
        if m:
            ports.add(int(m.group(1)))
    return ports


def port_open(port, host="127.0.0.1", timeout=0.6):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def agent_card(port):
    """Read the public agent card only. No auth, no secrets."""
    import urllib.request
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/.well-known/agent.json", timeout=0.8
        ) as resp:
            if resp.status != 200:
                return {"reachable": False}
            card = json.loads(resp.read().decode("utf-8", "replace"))
        skills = card.get("skills") or []
        return {
            "reachable": True,
            "name": card.get("name"),
            "description": card.get("description"),
            "protocols": card.get("protocols") or card.get("protocolVersion"),
            "skillCount": len(skills) if isinstance(skills, list) else 0,
            "skills": [s.get("id") if isinstance(s, dict) else s
                       for s in skills][:12] if isinstance(skills, list) else [],
        }
    except Exception:
        return {"reachable": False}


def doc_presence(base):
    """Which allowlisted documents exist, and their size. Contents are NOT read."""
    found = {}
    try:
        entries = os.listdir(base)
    except OSError:
        return found
    for name in DOC_ALLOWLIST:
        p = os.path.join(base, name)
        if os.path.isfile(p):
            try:
                found[name] = os.path.getsize(p)
            except OSError:
                found[name] = -1
    obs = os.path.join(base, "obsidian")
    if os.path.isdir(obs):
        try:
            md = [f for f in os.listdir(obs) if f.endswith(".md")]
            if md:
                found["obsidian/"] = len(md)
        except OSError:
            pass
    return found


def registry():
    """Read the canonical agent registry shipped to the server."""
    path = f"{HERMES}/registry.json"
    if not os.path.exists(path):
        return []
    try:
        with open(path) as fh:
            data = json.load(fh)
    except Exception:
        return []
    return data.get("agents", [])


def main():
    t0 = time.time()
    reg = {a["profile"]: a for a in registry()}
    gw = gateway_states()
    ports = listening_ports()

    profiles = ["default"] + sorted(
        d for d in (os.listdir(PROFILES_DIR) if os.path.isdir(PROFILES_DIR) else [])
        if os.path.isdir(os.path.join(PROFILES_DIR, d))
    )

    agents = []
    for prof in profiles:
        base = HERMES if prof == "default" else f"{PROFILES_DIR}/{prof}"
        cfg_path = f"{HERMES}/config.yaml" if prof == "default" else f"{base}/config.yaml"
        cfg = read_config(cfg_path)
        meta = reg.get(prof, {})

        declared_port = meta.get("port")
        peers = cfg.get("a2a_agents") or {}
        peer_count = len(peers) if isinstance(peers, dict) else 0

        gw_block = cfg.get("gateway") or {}
        plats = ((gw_block.get("platforms") or {}).get("a2a") or {})
        cfg_port = ((plats.get("extra") or {}).get("port")) or plats.get("port")
        port = int(declared_port or cfg_port or 0) or None

        gwi = gw.get(prof, {})
        is_running = bool(gwi.get("processRunning")) or gwi.get("state") == "running"
        listening = port in ports if port else False
        reachable = port_open(port) if port else False
        card = agent_card(port) if reachable else {"reachable": False}

        state = "running" if (is_running and listening) else (
            "installed" if os.path.isdir(base) else "missing")

        agents.append({
            "id": prof,
            "displayName": meta.get("display_name") or (cfg.get("description") or prof),
            "title": meta.get("title"),
            "department": meta.get("department"),
            "reportsTo": meta.get("reports_to"),
            "port": port,
            "peers": peer_count,
            "gateway": state,
            "processRunning": is_running,
            "portListening": listening,
            "a2aReachable": bool(reachable or card.get("reachable")),
            "gatewayState": gwi.get("state"),
            "a2aState": gwi.get("a2a"),
            "codeVersion": gwi.get("codeVersion"),
            "agentCard": card,
            "lifecycle": meta.get("state", "existing"),
            "skills": meta.get("skills", [])[:12],
            "docs": doc_presence(base),
            "hasEnv": os.path.exists(f"{base}/.env"),
        })

    vault_docs = 0
    if os.path.isdir(VAULT):
        for _, _, files in os.walk(VAULT):
            vault_docs += sum(1 for f in files if f.endswith(".md"))

    payload = {
        "generatedAt": time.time() * 1000,
        "host": "72.61.141.91",
        "hermesRoot": HERMES,
        "vaultPath": VAULT,
        "vaultDocs": vault_docs,
        "agents": agents,
        "totals": {
            "profiles": len(agents),
            "running": sum(1 for a in agents if a["gateway"] == "running"),
            "installed": sum(1 for a in agents if a["gateway"] == "installed"),
            "reachable": sum(1 for a in agents if a["a2aReachable"]),
            "withDocs": sum(1 for a in agents if len(a["docs"]) >= 6),
        },
        "collectMs": round((time.time() - t0) * 1000, 1),
        "readOnly": True,
    }
    print(json.dumps(payload, separators=(",", ":")))


if __name__ == "__main__":
    main()
