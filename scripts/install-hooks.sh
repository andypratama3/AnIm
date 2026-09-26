#!/usr/bin/env bash
# Installs the local pre-commit guard that blocks secret leaks.
set -euo pipefail
cd "$(dirname "$0")/.."
HOOK=".git/hooks/pre-commit"
mkdir -p .git/hooks
cat > "$HOOK" <<'HOOK'
#!/usr/bin/env bash
exec "$(pwd)/scripts/secret-scan.sh" --staged
HOOK
chmod +x "$HOOK"
echo "installed $HOOK"
