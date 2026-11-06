#!/bin/sh
# COOK-6 criterion 9, manual verification (needs Docker; not run in CI).
#
# Runs the PREVIOUS release image against a MIGRATED copy of the database and
# proves it can still read old rows, show the same `source`, and create and read
# a recipe. Then runs the NEW code against the row the old image created
# (contributorId and totalMinutes NULL).
#
#   scripts/verify-rollback.sh postgresql://postgres@127.0.0.1:55541/cook_book [old-image-tag]
#
# The database must be a throwaway COPY on loopback, already migrated (run
# backend/scripts/verify-migration-copy.mjs first). Refuses anything else.
# Needs: docker, curl, jq, and `npx prisma generate` done in backend/.
set -eu

DB_URL="${1:?usage: verify-rollback.sh <loopback postgres url of a migrated COPY> [old-image-tag]}"
TAG="${2:-1.2.0}"
IMAGE="ghcr.io/einlanzerous/cook_book:${TAG}"
OLD_PORT="${OLD_PORT:-55561}"
NEW_PORT="${NEW_PORT:-55562}"
NAME="cook-book-rollback-check"

case "$DB_URL" in
  postgresql://*@127.0.0.1:*|postgresql://*@localhost:*) ;;
  *) echo "refusing: database URL must be on loopback" >&2; exit 2 ;;
esac
case "$DB_URL" in
  *:5432/*|*:5433/*) echo "refusing: port 5432/5433 is a real database" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NEW_PID=""
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  [ -n "$NEW_PID" ] && kill "$NEW_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_http() { # url
  i=0
  while [ $i -lt 60 ]; do
    if curl -fsS "$1" >/dev/null 2>&1; then return 0; fi
    i=$((i + 1)); sleep 1
  done
  echo "timed out waiting for $1" >&2; return 1
}

echo "== old image $IMAGE on loopback port $OLD_PORT against the migrated copy =="
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --network host -e PORT="$OLD_PORT" -e DATABASE_URL="$DB_URL" "$IMAGE" >/dev/null
wait_http "http://127.0.0.1:$OLD_PORT/api/health"
curl -fsS "http://127.0.0.1:$OLD_PORT/api/health"; echo

echo "-- old image: GET /api/recipes (pre-existing rows keep their stored source)"
curl -fsS "http://127.0.0.1:$OLD_PORT/api/recipes" | jq -r '[.[].source] | group_by(.) | map({source: .[0], n: length})'

echo "-- old image: POST a recipe (new NOT NULL columns have defaults)"
CREATED="$(curl -fsS -X POST "http://127.0.0.1:$OLD_PORT/api/recipes" -H 'content-type: application/json' \
  -d '{"title":"Rollback check","prepTime":5,"cookTime":10,"ingredients":[{"name":"flour","amount":"2","unit":"cups"}],"directions":["Mix"],"tags":["Rollback"]}')"
ID="$(echo "$CREATED" | jq -r .id)"
echo "created $ID"
curl -fsS "http://127.0.0.1:$OLD_PORT/api/recipes/$ID" | jq '{title, source, ingredients: (.ingredients | length)}'

docker rm -f "$NAME" >/dev/null

echo "== new code reads the row the old image created =="
( cd "$ROOT/backend" && DATABASE_URL="$DB_URL" PORT="$NEW_PORT" node src/index.js >/dev/null 2>&1 ) &
NEW_PID=$!
wait_http "http://127.0.0.1:$NEW_PORT/api/health"
curl -fsS "http://127.0.0.1:$NEW_PORT/api/recipes/$ID" | jq '{title, contributor, totalMinutes, sourceLabel, timeSplitEstimated}'
test "$(curl -fsS "http://127.0.0.1:$NEW_PORT/api/recipes/$ID" | jq -r '.contributor')" = "null"
test "$(curl -fsS "http://127.0.0.1:$NEW_PORT/api/recipes" | jq 'length')" -ge 9

# tidy: remove the row we created so the copy stays comparable
curl -fsS -X DELETE "http://127.0.0.1:$NEW_PORT/api/recipes/$ID" >/dev/null
echo "PASS: old image reads/creates on the migrated schema; new code reads the old-image row (contributor null)."
