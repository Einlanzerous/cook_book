#!/bin/sh
# COOK-6 criterion 9 / COOK-23 criterion 10, manual verification (needs Docker;
# not run in CI).
#
# Runs the PREVIOUS release image against a MIGRATED copy of the database and
# proves it can still read old rows, show the same `source`, and create and read
# a recipe (the 2.0.0 image attributes it to `magos` through its fallback). Then
# runs the NEW code against that row, signed in as the dev identity:
#
#   * the copy's `magos` email is set to DEV_AUTH_EMAIL;
#   * the new code starts with AUTH_MODE=dev, PUBLIC_ORIGIN=http://127.0.0.1:<port>
#     and DEV_AUTH_EMAIL, so its config guards are satisfied;
#   * `curl -c jar .../auth/sso` signs in as that identity (sub `dev:<email>`),
#     which binds the `magos` row, so the session's contributor IS `magos`;
#   * the row the old image created must read back with contributor `magos`, an
#     unauthenticated DELETE must be 401, and the cleanup DELETE uses the cookie
#     jar (the caller is the recipe's author, so it passes the ownership rule).
#
#   scripts/verify-rollback.sh postgresql://postgres@127.0.0.1:55541/cook_book [old-image-tag]
#
# The database must be a throwaway COPY on loopback, already migrated (run
# backend/scripts/verify-migration-copy.mjs first). Refuses anything else.
# Needs: docker, curl, jq, and `npx prisma generate` done in backend/.
set -eu

DB_URL="${1:?usage: verify-rollback.sh <loopback postgres url of a migrated COPY> [old-image-tag]}"
TAG="${2:-2.0.0}"
IMAGE="ghcr.io/einlanzerous/cook_book:${TAG}"
OLD_PORT="${OLD_PORT:-55561}"
NEW_PORT="${NEW_PORT:-55562}"
NAME="cook-book-rollback-check"
DEV_AUTH_EMAIL="${DEV_AUTH_EMAIL:-rollback-check@example.com}"
JAR="$(mktemp)"

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
  rm -f "$JAR"
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

echo "== new code (AUTH_MODE=dev as $DEV_AUTH_EMAIL) reads the row the old image created =="
# The copy's `magos` row gets the dev identity's email, so the dev sign-in binds it.
( cd "$ROOT/backend" && DB_URL="$DB_URL" DEV_EMAIL="$DEV_AUTH_EMAIL" node --input-type=module -e '
  import pg from "pg";
  const c = new pg.Client({ connectionString: process.env.DB_URL });
  await c.connect();
  const r = await c.query("UPDATE \"Contributor\" SET email = $1 WHERE lower(name) = $2", [process.env.DEV_EMAIL, "magos"]);
  console.log("magos email set on " + r.rowCount + " row(s)");
  await c.end();
' )

( cd "$ROOT/backend" && DATABASE_URL="$DB_URL" PORT="$NEW_PORT" AUTH_MODE=dev \
    PUBLIC_ORIGIN="http://127.0.0.1:$NEW_PORT" DEV_AUTH_EMAIL="$DEV_AUTH_EMAIL" node src/index.js >/dev/null 2>&1 ) &
NEW_PID=$!
wait_http "http://127.0.0.1:$NEW_PORT/api/health"

echo "-- new code: sign in through /auth/sso (dev identity)"
curl -fsS -c "$JAR" -o /dev/null "http://127.0.0.1:$NEW_PORT/auth/sso"
curl -fsS -b "$JAR" "http://127.0.0.1:$NEW_PORT/api/me"; echo

echo "-- new code: the row the old image created"
curl -fsS "http://127.0.0.1:$NEW_PORT/api/recipes/$ID" | jq '{title, contributor: .contributor.name, totalMinutes, sourceLabel, timeSplitEstimated}'
test "$(curl -fsS "http://127.0.0.1:$NEW_PORT/api/recipes/$ID" | jq -r '.contributor.name')" = "magos"
test "$(curl -fsS "http://127.0.0.1:$NEW_PORT/api/recipes" | jq 'length')" -ge 9

echo "-- new code: an unauthenticated write is refused"
test "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "http://127.0.0.1:$NEW_PORT/api/recipes/$ID")" = "401"

# tidy: remove the row we created (as its author) so the copy stays comparable
curl -fsS -b "$JAR" -X DELETE "http://127.0.0.1:$NEW_PORT/api/recipes/$ID" >/dev/null
echo "PASS: old image reads/creates on the migrated schema; new code reads the old-image row (contributor magos), signs in via /auth/sso and refuses unauthenticated writes."
