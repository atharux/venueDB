#!/usr/bin/env bash
# Run the VOD lead engine + SQLite DB from an external drive (default: LaCie 2TB).
#
# Usage:
#   npm run local-api:hd                 # uses drive named "LaCie"
#   npm run local-api:hd -- "LaCie 2TB"  # override the volume name
#   LACIE_NAME="My Drive" npm run local-api:hd
#
# Safety: refuses to start unless the drive is actually mounted, so it can never
# create a stray /Volumes/<name> folder that would push the real mount aside.
set -euo pipefail

DRIVE_NAME="${1:-${LACIE_NAME:-LaCie}}"
MOUNT="/Volumes/${DRIVE_NAME}"
DB_DIR="${MOUNT}/vod-data"

# Verify the path is a real, currently-mounted volume (not just an empty folder).
if ! mount | grep -q " on ${MOUNT} "; then
  echo "✗ Drive '${DRIVE_NAME}' is not mounted at ${MOUNT}."
  echo ""
  echo "  Plug in the drive, then check its exact name under /Volumes:"
  ls -1 /Volumes/ | sed 's/^/    - /'
  echo ""
  echo "  If the name differs, pass it:  npm run local-api:hd -- \"<exact name>\""
  exit 1
fi

mkdir -p "${DB_DIR}"
echo "→ Lead engine DB: ${DB_DIR}/venues.db"
echo "→ Server:         http://localhost:${LOCAL_API_PORT:-8787}"
echo ""

cd "$(dirname "$0")/.."
VENUE_DB_DIR="${DB_DIR}" exec node local-api-server.mjs
