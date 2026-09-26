#!/usr/bin/env bash
#
# Verify the agent mesh is reachable only from the machine that runs it.
#
# Ports 9900-9925 carry the A2A gateways. They hold peer tokens and the agent
# cards, so they must never answer from the internet: the dashboard reaches them
# over SSH, and nothing else needs them. This check is read-only and safe to run
# at any time; it exits non-zero the moment that stops being true.
#
# Two ways to get this wrong, both checked:
#   1. a gateway binding 0.0.0.0 (or any non-loopback address) instead of 127.0.0.1
#   2. a firewall rule that opens the range from anywhere
#
# Usage: bash scripts/check-port-exposure.sh [host] [user]

set -euo pipefail

HOST="${1:-${ANIM_SSH_HOST:-root@72.61.141.91}}"
LOOPBACK="127.0.0.1|::1|\[::1\]"

echo "Checking mesh port exposure on ${HOST}"

report=$(ssh -o BatchMode=yes -o ConnectTimeout=10 "${HOST}" 'bash -s' <<'REMOTE'
set -uo pipefail
range='99[0-2][0-9]'

echo "--- bind addresses"
# Any hermes listener not on loopback is the failure we care about.
ss -ltnp 2>/dev/null | grep -E ":${range}[[:space:]]" | awk '{print $4}' | sort -u

echo "--- offending listeners"
ss -ltnp 2>/dev/null \
  | grep -E ":${range}[[:space:]]" \
  | grep -Ev "127\.0\.0\.1:${range}|\[::1\]:${range}" \
  || true

echo "--- firewall rules mentioning the range"
if command -v iptables >/dev/null 2>&1; then
  iptables -S 2>/dev/null | grep -E -- "--dport (${range}|${range}:${range})" || true
elif command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --list-all 2>/dev/null | grep -E "port=\"${range}" || true
fi

echo "--- default input policy"
if command -v iptables >/dev/null 2>&1; then
  iptables -S INPUT 2>/dev/null | grep -E '^-P INPUT' || echo "unknown"
elif command -v ufw >/dev/null 2>&1; then
  ufw status 2>/dev/null | head -1 || echo "unknown"
else
  echo "no firewall tooling found"
fi
REMOTE
) || {
  echo "FAIL: could not reach ${HOST}" >&2
  exit 2
}

echo "${report}"

offenders=$(printf '%s\n' "${report}" | sed -n '/--- offending listeners/,/--- firewall rules/p' | grep -E "LISTEN" || true)
open_rules=$(printf '%s\n' "${report}" | sed -n '/--- firewall rules/,/--- default input policy/p' | grep -E "dport|port=" || true)
default_policy=$(printf '%s\n' "${report}" | sed -n '/--- default input policy/,$p' | tail -1)

status=0

if [ -n "${offenders}" ]; then
  echo
  echo "FAIL: a mesh port is bound to a non-loopback address:" >&2
  printf '%s\n' "${offenders}" >&2
  status=1
fi

if [ -n "${open_rules}" ]; then
  echo
  echo "FAIL: a firewall rule opens the mesh port range:" >&2
  printf '%s\n' "${open_rules}" >&2
  status=1
fi

case "${default_policy}" in
  *DROP*|*REJECT*) ;;
  *)
    echo
    echo "WARN: default INPUT policy is '${default_policy}', not DROP. The ports" >&2
    echo "      are still safe if they bind to loopback, but a new listener on" >&2
    echo "      0.0.0.0 would be published. Consider 'iptables -P INPUT DROP'." >&2
    ;;
esac

echo
if [ "${status}" -eq 0 ]; then
  echo "OK: mesh ports are loopback-only and closed to the network."
else
  echo "Mesh ports must stay on 127.0.0.1. Reach the dashboard's SSH host instead." >&2
fi
exit "${status}"
