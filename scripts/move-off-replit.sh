#!/usr/bin/env bash
# Move AstroPilot's data off Replit: copy the journal photos into the database, then copy the whole
# database (users, logins, locations, gear, journal, photos) into a new Postgres database.
# Run it in the Replit Shell, with the new database's EXTERNAL connection URL:
#
#   NEW_DATABASE_URL='postgres://…' bash <(curl -fsSL https://raw.githubusercontent.com/hkaldis/astropilot/main/scripts/move-off-replit.sh)
#
# It never changes or deletes anything in the Replit database. You can run it again right before you
# switch the domain over, to bring across anything logged in the meantime (the new copy is replaced).
set -euo pipefail
cd "${REPL_HOME:-$PWD}"

: "${DATABASE_URL:?DATABASE_URL isn't set — run this in the Replit Shell of the AstroPilot Repl.}"
: "${NEW_DATABASE_URL:?Set NEW_DATABASE_URL to the new database's external URL (Render → astropilot-db → Connect → External).}"
if [ "$DATABASE_URL" = "$NEW_DATABASE_URL" ]; then echo "NEW_DATABASE_URL is the current database — stopping."; exit 1; fi
for tool in pg_dump pg_restore psql; do
  command -v "$tool" >/dev/null || { echo "$tool isn't available in this Repl. Add the PostgreSQL tools (Tools → Packages → postgresql) and run again."; exit 1; }
done

if [ ! -f scripts/copy-photos-to-db.ts ]; then
  echo "→ Updating the Repl's code first (needed to copy photos)"
  bash <(curl -fsSL https://raw.githubusercontent.com/hkaldis/astropilot/main/scripts/replit-update.sh)
fi

echo "→ Copying photos from Replit Object Storage into the database"
npx tsx scripts/copy-photos-to-db.ts

echo "→ Dumping the Replit database ($(pg_dump --version))"
DUMP="$(mktemp -d)/astropilot.dump"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$DUMP"
echo "  $(du -h "$DUMP" | cut -f1) dump"

echo "→ Restoring into the new database"
pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error --dbname="$NEW_DATABASE_URL" "$DUMP"

echo "→ Checking row counts (Replit → new)"
ok=1
for t in users sessions locations telescopes eyepieces observation_sessions observations observation_photos photo_blobs watchlist_items; do
  a="$(psql "$DATABASE_URL" -Atc "select count(*) from $t" 2>/dev/null || echo -)"
  b="$(psql "$NEW_DATABASE_URL" -Atc "select count(*) from $t" 2>/dev/null || echo -)"
  mark="ok"; [ "$a" = "$b" ] || { mark="DIFFERENT"; ok=0; }
  printf "  %-22s %8s → %-8s %s\n" "$t" "$a" "$b" "$mark"
done
rm -f "$DUMP"
if [ "$ok" = 1 ]; then echo "✓ All data copied. Next: follow docs/hosting.md to switch astropilot.space to the new host."; else echo "Some counts differ — don't switch the domain yet; check the messages above."; exit 1; fi
