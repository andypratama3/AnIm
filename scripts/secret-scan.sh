#!/usr/bin/env bash
# AnIm — secret leak guard.
#
# Scans everything about to be committed (or the whole worktree with --all) for
# credential patterns. Exits non-zero on any finding, so it works both as a
# pre-commit hook and in CI.
#
# Usage:
#   scripts/secret-scan.sh            # staged files (pre-commit default)
#   scripts/secret-scan.sh --all      # tracked + untracked, non-ignored files
#   scripts/secret-scan.sh --staged   # explicit staged scan
#
# Portable to macOS bash 3.2 + BSD xargs (no mapfile/readarray, no xargs -a).

set -uo pipefail

cd "$(dirname "$0")/.." || exit 2

MODE="${1:---staged}"
SELF="scripts/secret-scan.sh"

is_noise() {
  case "$1" in
    package-lock.json|pnpm-lock.yaml|yarn.lock) return 0 ;;
    "$SELF") return 0 ;;
    node_modules/*|.next/*) return 0 ;;
    *.png|*.jpg|*.jpeg|*.gif|*.ico|*.woff|*.woff2) return 0 ;;
  esac
  return 1
}

# one "pattern :: label" pair per line
PATTERNS='
sk-or-v1-[A-Za-z0-9_-]{10,} :: OpenRouter API key
sk-[A-Za-z0-9]{24,} :: OpenAI-style API key
ghp_[A-Za-z0-9]{20,} :: GitHub PAT
github_pat_[A-Za-z0-9_]{20,} :: GitHub fine-grained PAT
gho_[A-Za-z0-9]{20,} :: GitHub OAuth token
xox[abprs]-[A-Za-z0-9-]{10,} :: Slack token
AKIA[0-9A-Z]{16} :: AWS access key id
AIza[0-9A-Za-z_-]{30,} :: Google API key
eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,} :: JWT
-----BEGIN [A-Z ]*PRIVATE KEY----- :: Private key block
(OPENROUTER|DISCORD_BOT|SLACK_BOT|TELEGRAM|GITHUB|HF|NEBIUS|TOKENHUB|TOKENPLAN)_[A-Z_]*(TOKEN|KEY|SECRET)[A-Z_]*=[A-Za-z0-9_./+-]{12,} :: assigned credential env var
A2A_PEER_TOKENS=[A-Za-z0-9]{8,} :: A2A peer token material
A2A_AGENT_TOKEN=[A-Za-z0-9]{8,} :: A2A agent token
'

RAW="$(mktemp)"
LIST="$(mktemp)"
PATFILE="$(mktemp)"
HITS="$(mktemp)"
trap 'rm -f "$RAW" "$LIST" "$PATFILE" "$HITS"' EXIT

if [ "$MODE" = "--all" ]; then
  git ls-files --cached --others --exclude-standard > "$RAW" 2>/dev/null
else
  git diff --cached --name-only --diff-filter=ACMR > "$RAW" 2>/dev/null
fi

COUNT=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  is_noise "$f" && continue
  [ -f "$f" ] || continue
  printf '%s\n' "$f" >> "$LIST"
  COUNT=$((COUNT + 1))
done < "$RAW"

if [ "$COUNT" -eq 0 ]; then
  echo "secret-scan: nothing to scan."
  exit 0
fi

echo "$PATTERNS" | grep -v '^[[:space:]]*$' > "$PATFILE"

FOUND=0
while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  pattern="${entry%%::*}"; pattern="$(printf '%s' "$pattern" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  label="${entry##*::}"; label="$(printf '%s' "$label" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  out=$(tr '\n' '\0' < "$LIST" | xargs -0 rg --no-heading --line-number --color=never -e "$pattern" 2>/dev/null)
  if [ -n "$out" ]; then
    FOUND=1
    {
      echo "secret-scan: LEAK — $label"
      printf '%s\n' "$out" | sed 's/^/    /'
      echo
    } | tee -a "$HITS"
  fi
done < "$PATFILE"

if [ "$FOUND" -ne 0 ]; then
  echo "secret-scan: FAILED. Redact the values above (keep a short masked hint such as sk-or-v1-***) and commit again."
  exit 1
fi

echo "secret-scan: clean ($COUNT file(s) scanned)."
exit 0
