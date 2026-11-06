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

Because the migration is additive, rolling the app image back is safe. To prove
it for a given previous release (manual verification; needs Docker, not run in CI):

```sh
docker pull ghcr.io/einlanzerous/cook_book:1.2.0
scripts/verify-rollback.sh postgresql://postgres@127.0.0.1:55541/cook_book 1.2.0
```

It runs the old image on a loopback port against the migrated copy, checks
pre-existing rows keep their stored `source` (`hellofresh`), creates and reads a
recipe, then runs the new code against the row the old image created
(`contributorId` and `totalMinutes` NULL; the API serialises `contributor: null`).
Narrow cosmetic exception: a recipe written by new code with
`source='HelloFresh'` (what the importer now writes) shows no badge on the old
image, whose check is `source === 'hellofresh'`.

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

The migration creates one contributor named `magos` (id from
`gen_random_uuid()`, `joinedAt` = the earliest recipe `createdAt`, or the
migration time on an empty database) and attaches every existing recipe to it.
It is created even on an empty database because the API falls back to it
(ruling 11): a create with no `contributorId` is attributed to the contributor
whose `lower(name) = 'magos'`. If it is missing the API returns a clear 500, never
a recipe with a NULL contributor. The fallback is temporary: COOK-23 replaces it
with the caller's identity, COOK-26 removes it. **Do not rename or delete
`magos`** before then; the lookup is by name.

## 7. Replacing the legacy HelloFresh recipes (after COOK-27)

The eight production recipes were imported before this change: they have no
`quantity`, their category, cuisine and time tags are tags rather than columns,
and a scraper bug leaves some amounts wrong (COOK-27). They are **replaced, not
migrated**, once COOK-6 and COOK-27 are deployed. The delete step is required:
re-importing without it duplicates every recipe.

```sh
BASE=http://localhost:3000/api    # or the deployed URL
# 1. save the source urls first
curl -s $BASE/recipes | jq -r '.[] | select(.sourceUrl) | [.id, .sourceUrl] | @tsv' > legacy.tsv
# 2. delete each, then 3. re-import each from its url
while IFS="$(printf '\t')" read -r id url; do
  curl -s -X DELETE "$BASE/recipes/$id"
  curl -s -X POST "$BASE/import/hellofresh" -H 'content-type: application/json' \
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
