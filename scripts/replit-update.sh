#!/usr/bin/env bash
# Update a Replit workspace running the original AstroPilot to AstroPilot 2 from GitHub.
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/hkaldis/astropilot/main/scripts/replit-update.sh)
#
# What it does:
#   1. Backs up the current code to .backups/ (nothing is deleted without a copy).
#   2. Replaces the app code (client/, server/, shared/, script/, scripts/, configs) with GitHub main.
#      Keeps .replit, replit.nix, secrets, attached_assets/, .git and node_modules untouched.
#   3. Installs dependencies and builds.
# The database is migrated automatically and additively when the server starts — existing users,
# sessions, locations, equipment and observations are kept.
set -euo pipefail

REPO="${REPO:-https://github.com/hkaldis/astropilot.git}"
BRANCH="${BRANCH:-main}"
cd "${REPL_HOME:-$PWD}"

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p .backups
echo "→ Backing up current code to .backups/astropilot-before-update-$STAMP.tar.gz"
tar --exclude=./node_modules --exclude=./.backups --exclude=./.git --exclude=./dist --exclude=./.cache \
    -czf ".backups/astropilot-before-update-$STAMP.tar.gz" .

TMP="$(mktemp -d)"
echo "→ Fetching $REPO ($BRANCH)"
git clone --quiet --depth 1 --branch "$BRANCH" "$REPO" "$TMP/src"

echo "→ Replacing application code"
rm -rf client server shared script scripts
rm -f vite.config.ts tailwind.config.ts postcss.config.js drizzle.config.ts tsconfig.json components.json \
      design_guidelines.md replit.md mobile_tonights_conditions.png
(cd "$TMP/src" && tar --exclude=./.git -cf - .) | tar -xf -
rm -rf "$TMP"

echo "→ Installing dependencies"
npm install --no-audit --no-fund

echo "→ Building"
npm run build

echo
echo "✓ AstroPilot 2 is in place. Press Run to try it, then Deploy → Republish to update astropilot.space."
echo "  Your previous code is saved in .backups/ if you ever need it."
