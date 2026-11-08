# Runbook: database, migrations, deploy

Applies to the COOK-6 data-model migration (`20261106032216_contributors_and_recipe_metadata`)
and to every migration after it.

## 1. How migrations reach production

`docker-entrypoint.sh` runs `npx prisma migrate deploy` on **every container
start**. There is no separate migration step: the first deploy of an image that
carries a new migration **is** the production migration, and nothing in this
repo gates it. The deploy flow lives outside this repo.

Consequences:

- Take a dump before deploying an image that adds a migration (section 2). The
  dump is the only real data rollback. **Nothing enforces it.** Residual risk,
  owner: magos (to confirm). For COOK-6 the owner has said the data is eight
  public HelloFresh recipes and losing it does not matter, and that whoever
  implements the change takes the dump as a normal precaution without waiting
  on anyone.
- A failed migration leaves the container crash-looping (section 5).
- Migrations are written **expand-only** (additive: nothing dropped, renamed,
  retyped or rewritten, new NOT NULL columns have defaults) so the previous
  image keeps working against the migrated schema. Destructive "contract"
  steps are separate, later migrations (COOK-26).

## 2. Taking a dump and a read-only copy of production

Production Postgres is the `postgres` container on `construct_net`. Everything
below is read-only: `default_transaction_read_only=on` makes the session refuse
writes. Never restore into, or run a migration against, the production database.

```sh
# interactive, read-only
docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' postgres \
  sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d cook_book -X -A -F"|"'

# a copy of the data (keep it OUT of the repo: it is production data)
docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' postgres \
  sh -c 'pg_dump -U "${POSTGRES_USER:-postgres}" -d cook_book' > cook_book-$(date +%F).sql
```

No credentials appear in these commands; the container supplies the role.

Restore the copy into a **throwaway** container on a free loopback port. The
dump carries `ALTER ... OWNER TO <prod role>` lines; strip them rather than
creating the role:

```sh
docker run -d --name cook-prodcopy-pg -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 127.0.0.1:55541:5432 postgres:16-alpine
grep -v 'OWNER TO' cook_book-DATE.sql | grep -v '^GRANT' | grep -v '^REVOKE' > copy.sql
docker exec cook-prodcopy-pg psql -U postgres -c 'CREATE DATABASE cook_book'
docker exec -i cook-prodcopy-pg psql -U postgres -d cook_book -v ON_ERROR_STOP=1 -q < copy.sql
```

Check a migration against the copy (counts before and after, every pre-existing
column byte-identical, all recipes attached to the default contributor):

```sh
cd backend && node scripts/verify-migration-copy.mjs postgresql://postgres@127.0.0.1:55541/cook_book
```

The script refuses anything that is not a loopback URL on a port other than
5432/5433. Remove the container and the dump file when finished.

## 3. Verifying an app-image rollback

Because migrations are additive, rolling the app image back is safe. To prove
it for a given previous release (manual verification; needs Docker, curl and
jq; **not run in CI**):

```sh
docker pull ghcr.io/einlanzerous/cook_book:2.0.0
scripts/verify-rollback.sh postgresql://postgres@127.0.0.1:55541/cook_book 2.0.0
```

The database must be a throwaway, already-migrated copy on loopback (section 2,
then `backend/scripts/verify-migration-copy.mjs`). The script:

1. runs the OLD image on a loopback port against the migrated copy, checks
   pre-existing rows keep their stored `source`, and creates and reads a recipe
   (a 2.0.0 image attributes it to `magos` through its fallback);
2. sets the copy's `magos` email to a throwaway address, starts the NEW code with
   `AUTH_MODE=dev`, `PUBLIC_ORIGIN=http://127.0.0.1:<port>` and
   `DEV_AUTH_EMAIL` set to it, and signs in with `curl -c jar .../auth/sso`
   (dev identity `sub = dev:<email>`, which binds the `magos` row, so the
   session's contributor IS `magos`);
3. asserts the new code reads the row the old image created and that its
   contributor is `magos`, then deletes that row with the cookie jar (the caller
   is the author, so it passes the ownership rule).

Narrow cosmetic exception: a recipe written by new code with
`source='HelloFresh'` (what the importer writes) shows no badge on a 1.x image,
whose check is `source === 'hellofresh'`.

## 4. Writing a migration

```sh
make db-migrate-new NAME=add_thing     # prisma migrate dev --create-only
```

- `--create-only` writes the SQL file and does not apply it. `prisma migrate dev`
  never writes backfill SQL itself, so **hand-edit the file** to add backfills
  and anything Prisma cannot express. Then `make db-migrate` applies it
  (`prisma migrate deploy`; this is also what the container does).
- Keep backfills data-independent: no text-to-number cast, no division by a
  column, so no stored row can make the migration fail partway. (COOK-6 divides
  only by the constant 3.)
- Convert the timezone-less `createdAt` columns (UTC wall-clock) explicitly with
  `AT TIME ZONE 'UTC'`; do not rely on the session `TimeZone`. The test runs
  the migration under a non-UTC session.
- `gen_random_uuid()` needs PostgreSQL 13+ (production is 16.15). Prisma's
  `@default(uuid())` is applied client-side, so raw inserts must supply an id.
- `make db-migrate` used to run `prisma migrate dev --name init`; it no longer
  does, and `make db-migrate-new` is the way to start a new migration.

### Drift from raw indexes

Two indexes cannot be expressed in `schema.prisma`:

- `Contributor_lower_name_key` unique on `lower("name")` (case-insensitive
  contributor names: creating `Ada` after `ada` is a conflict, mapped to 409),
- `Recipe_lower_source_idx` on `lower("source")` (source reads and counts are
  case-insensitive).

`prisma migrate dev` replays migrations into a shadow database and diffs the
result with `schema.prisma`; because those indexes are not in the schema it
reports them as **drift** and proposes dropping them. **Do not accept that.**
Keep them, and review any generated migration for `DROP INDEX` lines on those
two names before applying. (`migrate deploy`, which production uses, does not
diff and is unaffected.) The same applies to the speculative column indexes
`Recipe_contributorId_idx` and `Recipe_totalMinutes_idx`, which are declared in
the schema and so do not drift.

## 5. Recovering from a failed migration

A migration that fails during `migrate deploy` is recorded as failed. The next
start refuses to continue (Prisma `P3009`) and the container crash-loops.

1. **Restore the dump** into the database (the safest path), or
2. fix the cause and mark the migration rolled back, then redeploy:

   ```sh
   npx prisma migrate resolve --rolled-back 20261106032216_contributors_and_recipe_metadata
   ```

   `--rolled-back` only tells Prisma to retry. It is safe **only if the failed
   migration left no partial changes** (it contained no explicit
   `BEGIN`/`COMMIT`, so the server rolled the whole file back). If the migration
   did partly apply, inspect the schema and repair by hand or restore the dump
   instead. If the change did fully apply, use `--applied` instead.

`migrate resolve` cannot be run with `docker exec` inside the crash-looping
container (it exits before you can attach). Run it in a one-off container that
bypasses the entrypoint, on the same network and with the same `DATABASE_URL`:

```sh
docker run --rm --network construct_net --env-file <the app's env file> \
  --entrypoint sh ghcr.io/einlanzerous/cook_book:<tag> \
  -c 'npx prisma migrate resolve --rolled-back 20261106032216_contributors_and_recipe_metadata'
```

## 6. Default contributor

The migration creates one contributor named `magos` and attaches every existing
recipe to it. Since COOK-23 attribution comes from the signed-in caller; the
`magos` fallback in the API is gone. `magos` is now simply the legacy owner row:
bind it to the owner's sign-in (section 10) so the legacy recipes stay theirs.
Do not rename it (the seed and the runbook SQL look it up by name).

## 7. Replacing the legacy HelloFresh recipes (after COOK-27)

The eight production recipes were imported before this change: they have no
`quantity`, their category, cuisine and time tags are tags rather than columns,
and a scraper bug leaves some amounts wrong (COOK-27). They are **replaced, not
migrated**, once COOK-6 and COOK-27 are deployed. The delete step is required:
re-importing without it duplicates every recipe.

Writes now need a session (COOK-23). Sign in as the owner (the `magos` row's
owner), copy the session cookie from the browser's dev tools into `COOKIE`, and
send it with every write; only the author may delete, and the legacy recipes are
`magos`'s.

```sh
BASE=http://localhost:3000/api    # or the deployed URL
COOKIE='__Host-cb_session=<value>'  # `cb_session` in AUTH_MODE=dev
# 1. save the source urls first
curl -s $BASE/recipes | jq -r '.[] | select(.sourceUrl) | [.id, .sourceUrl] | @tsv' > legacy.tsv
# 2. delete each, then 3. re-import each from its url
while IFS="$(printf '\t')" read -r id url; do
  curl -s -X DELETE "$BASE/recipes/$id" -H "Cookie: $COOKIE"
  curl -s -X POST "$BASE/import/hellofresh" -H 'content-type: application/json' -H "Cookie: $COOKIE" \
    -d "$(jq -n --arg url "$url" '{url: $url}')" | jq -r '.title'
done < legacy.tsv
```

What this loses, and the owner accepts: the recipes' ids and `createdAt`
(they become "recently added"), any manual edits, and the old tags (replaced by
whatever the importer now emits). Orphaned legacy tags stay in the `Tag` table
but `/api/tags` omits tags with no recipes; cleaning them up is COOK-26.

## 8. Reading sources and time buckets

- `source` is stored exactly as written (`hellofresh`, `HelloFresh`, ...). The
  API adds `sourceLabel`: HelloFresh for `lower(trim(source)) = 'hellofresh'`;
  `null` for `manual` or blank; otherwise the trimmed value. **Anything that
  groups or counts sources must group on `lower(trim(source))` and exclude
  `'manual'`** (binding on COOK-8/11).
- The write path no longer creates time, cuisine, category or `Vegetarian`
  tags; those are columns (`totalMinutes`, `cuisine`, `category`,
  `vegetarian`). "Under 30 min" is `totalMinutes <= 30`. Legacy rows keep their
  old tags, whose buckets were `<=15 '15 Minutes'`, `<=30 '30 Minutes'`,
  `<=45 '45 Minutes'`, `<=60 '1 Hour'`, else `'1 Hour+'`
  (`backend/src/services/recipeShape.js`).
- `timeSplitEstimated` is a hint that `prepTime`/`cookTime` are the importer's
  1/3 + 2/3 guess. Consumers must not hide the stored values because of it.

## 9. Seeding and tests

```sh
make db-seed         # empty database only; refuses if recipes or other contributors exist
make db-seed-force   # node prisma/seed.js --force: wipes recipes, tags and contributors first
make test            # both packages; DB-backed tests skip without COOK_TEST_DATABASE_URL
make test-db         # the same against a throwaway postgres:16-alpine (port TEST_PG_PORT=55540)
```

`seed.js` always refuses under `NODE_ENV=production`, and `--force` does not
override that. `NODE_ENV` is not set in the Dockerfile, so the real protection
is the second rule: it also refuses when any `Recipe` or any contributor other
than `magos` exists. Never run it against a database you care about.

## 10. Sign-in, sessions and the owner (COOK-23)

Contributors live only in Cloudflare Access. The app verifies the Access JWT at
`GET /auth/sso`, mints its own session (an opaque token in the
`__Host-cb_session` cookie, stored as a SHA-256 hash in the `Session` table, 30
days, fixed life, no sliding renewal) and attributes every write to that
contributor. Everything without a session is a 401.

### Environment

| Env | Value |
|---|---|
| `AUTH_MODE` | `access` (default). `dev` only on a loopback `PUBLIC_ORIGIN` and never with `NODE_ENV=production`; both are checked at boot |
| `CF_ACCESS_TEAM_DOMAIN` | e.g. `zero-gravity-industries.cloudflareaccess.com` (bare host) |
| `CF_ACCESS_AUD` | the Access application's AUD (one value; it changes at the Phase 2 cutover) |
| `PUBLIC_ORIGIN` | `https://commonplace.zerogravity.industries` (the `Origin` check compares against it) |
| `SESSION_DAYS` | optional, default 30 |
| `SSO_ENABLED` | optional; `false` makes `/auth/sso` 404 (reads keep working) |
| `DEV_AUTH_EMAIL` | `AUTH_MODE=dev` only; must be unset in prod |

The process **refuses to start** if the access-mode variables are missing or
malformed. Because `docker-entrypoint.sh` runs `prisma migrate deploy` before
`node`, a new image started without them migrates and then crash-loops: the
construct-server env change must be deployed **first** (it is harmless to 2.0.0).
Check with `docker exec cook_book env | grep -E 'CF_ACCESS|PUBLIC_ORIGIN'`.

### Binding the owner (before the COOK-23 image is promoted)

`magos` has no email, so it would match nobody. Run once, **before** promoting
the COOK-23 image (2.0.0 ignores the column, so this is safe at any time after
Phase 1 is live, and doing it first closes the window in which another member
could sign in before the owner). Use the exact address Access signs in with, lower case:

```sql
UPDATE "Contributor" SET email = '<owner email, lower case>' WHERE lower(name) = 'magos';
```

The owner's first `/auth/sso` then binds `externalId` (the Access `sub`) to that
row, and every legacy recipe stays attributed to them. The app logs a boot
warning (`auth.boot warning: contributor ... has no email or externalId`) for any
contributor that owns recipes but can never be signed in as; seeing it for
`magos` means this step was missed.

### Owner signed in first (recovery)

If the owner signed in before the UPDATE they got a NEW contributor holding their
email, and the UPDATE above fails on `Contributor_email_key`. Recover in one
transaction (this is the exact SQL a test runs): it re-attributes anything that
row created, removes it (its sessions cascade), then sets the email on `magos`:

```sql
BEGIN;
UPDATE "Recipe" SET "contributorId" = (SELECT id FROM "Contributor" WHERE lower(name) = 'magos')
  WHERE "contributorId" = (SELECT id FROM "Contributor" WHERE email = '<owner email>');
DELETE FROM "Contributor" WHERE email = '<owner email>';
UPDATE "Contributor" SET email = '<owner email>' WHERE lower(name) = 'magos';
COMMIT;
```

Then sign in again so the bind happens on `magos`.

### Naming people

New contributors are created on first sign-in with a neutral placeholder name
(`Cook 3`), because `GET /api/contributors` is public and an email must never be
shown. Name them when you invite them:

```sql
UPDATE "Contributor" SET name = 'Mara Okafor', bio = '...' WHERE email = 'mara@example.com';
```

### Revoking a person

Removing someone from the Access group does **not** end an existing session; it
lives out its 30 days. Do both:

1. remove them from the Access group (Cloudflare);
2. end their sessions (takes effect on their next request):

```sql
UPDATE "Session" SET "revokedAt" = now()
  WHERE "contributorId" = (SELECT id FROM "Contributor" WHERE email = '<their email>')
    AND "revokedAt" IS NULL;
```

### Pruning

Expired and revoked rows are pruned opportunistically at every sign-in, so no
scheduler is needed. To prune by hand (a test pins this statement):

```sql
DELETE FROM "Session" WHERE "expiresAt" < now() - interval '7 days'
  OR ("revokedAt" IS NOT NULL AND "revokedAt" < now() - interval '7 days');
```

### Rollback to 2.0.0

Revert the image to 2.0.0. The `Session` table is ignored by it
(`scripts/verify-rollback.sh`, section 3). **Writes are open again** (the
pre-COOK-23 exposure), so do not make the host public while rolled back. To drop
the table as well, only after the image is rolled back:
`DROP TABLE "Session"; DELETE FROM "_prisma_migrations" WHERE migration_name = '20261107120000_session_table';`

### Known Phase 1 gap

Until Phase 2 narrows Access to `/auth/sso` with the dedicated contributors
policy, `/auth/sso` is behind the broad members group, so any member who opens it
becomes a contributor. Every member already has unauthenticated write access
today, so this is no regression; the "invited contributors only" boundary is real
only from Phase 2. Setting `SSO_ENABLED=false` switches sign-in off.

### Not verifiable from the repo

Whether Traefik forwards `Cf-Access-Jwt-Assertion` to `cook_book`, and container
egress to the Access certs URL, are only confirmable live. The failure signal for
the first is the log line `auth.sso reject reason=missing`. The named live check
is in the COOK-23 plan.
