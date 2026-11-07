#!/usr/bin/env node
/**
 * COOK-6 criterion 2: apply the pending migrations to a COPY of the production
 * database and prove nothing pre-existing changed. Manual verification, not CI
 * (the copy comes from the prod box; see docs/runbook.md).
 *
 *   node scripts/verify-migration-copy.mjs postgresql://postgres@127.0.0.1:55541/cook_book
 *
 * Refuses anything that is not a loopback URL on a port other than 5432/5433,
 * so it cannot be pointed at the real database by accident. Prints before/after
 * row counts and a per-column check, and exits non-zero on any difference.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.argv[2];
if (!url) {
  console.error('usage: node scripts/verify-migration-copy.mjs <loopback postgres url of a COPY>');
  process.exit(2);
}
const u = new URL(url);
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname) || ['', '5432', '5433'].includes(u.port)) {
  console.error('refusing: not a loopback URL on a throwaway port (never run this against the real database).');
  process.exit(2);
}
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLES = ['Recipe', 'Ingredient', 'Direction', 'Tag', '_RecipeTags'];

const client = new pg.Client({ connectionString: url });
await client.connect();

async function snapshot() {
  const out = { counts: {}, cols: {} };
  for (const t of TABLES) {
    out.counts[t] = (await client.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;
    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t]);
    out.cols[t] = cols.map((c) => c.column_name);
  }
  return out;
}
// Hash each pre-existing column independently so a change names the column.
async function columnHashes(colsByTable) {
  const h = {};
  for (const [t, cols] of Object.entries(colsByTable)) {
    for (const c of cols) {
      const { rows } = await client.query(`SELECT "${c}"::text AS v FROM "${t}" ORDER BY 1`);
      h[`${t}.${c}`] = createHash('sha256').update(JSON.stringify(rows.map((r) => r.v))).digest('hex').slice(0, 16);
    }
  }
  return h;
}
const sourceValues = async () =>
  (await client.query(`SELECT id, source FROM "Recipe" ORDER BY id`)).rows;

const before = await snapshot();
const hashesBefore = await columnHashes(before.cols);
const sourcesBefore = await sourceValues();
console.log('BEFORE counts', JSON.stringify(before.counts));

console.log('--- prisma migrate deploy ---');
console.log(execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: backendDir, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8'
}).split('\n').filter((l) => /migration|applied|No pending/i.test(l)).join('\n'));

const after = await snapshot();
const hashesAfter = await columnHashes(before.cols); // only the pre-existing columns
const sourcesAfter = await sourceValues();
console.log('AFTER  counts', JSON.stringify(after.counts));

const problems = [];
for (const t of TABLES) if (before.counts[t] !== after.counts[t]) problems.push(`row count changed: ${t}`);
for (const k of Object.keys(hashesBefore)) if (hashesBefore[k] !== hashesAfter[k]) problems.push(`value changed: ${k}`);
if (JSON.stringify(sourcesBefore) !== JSON.stringify(sourcesAfter)) problems.push('Recipe.source not byte-identical');

const q = async (sql) => (await client.query(sql)).rows;
const [{ n: contributors }] = await q(`SELECT count(*)::int AS n FROM "Contributor"`);
const [{ n: magosOnAll }] = await q(`SELECT count(*)::int AS n FROM "Recipe" r JOIN "Contributor" c ON c.id = r."contributorId" WHERE c.name = 'magos'`);
const [{ n: nullQty }] = await q(`SELECT count(*)::int AS n FROM "Ingredient" WHERE quantity IS NULL`);
const [{ n: estimated }] = await q(`SELECT count(*)::int AS n FROM "Recipe" WHERE "timeSplitEstimated"`);
const [{ n: veg }] = await q(`SELECT count(*)::int AS n FROM "Recipe" WHERE vegetarian`);
const [{ n: totals }] = await q(`SELECT count(*)::int AS n FROM "Recipe" WHERE "totalMinutes" = coalesce("prepTime",0) + coalesce("cookTime",0)`);
const [{ joined, minc }] = await q(`SELECT to_char(c."joinedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS') AS joined, to_char((SELECT min("createdAt") FROM "Recipe"),'YYYY-MM-DD"T"HH24:MI:SS.MS') AS minc FROM "Contributor" c WHERE c.name='magos'`);

console.log(JSON.stringify({
  contributors, recipesWithMagos: magosOnAll, recipes: after.counts.Recipe,
  ingredientsWithNullQuantity: nullQty, timeSplitEstimatedTrue: estimated, vegetarianTrue: veg,
  totalMinutesEqualsPrepPlusCook: totals, magosJoinedAtUTC: joined, minRecipeCreatedAt: minc
}, null, 2));

if (contributors !== 1) problems.push('expected exactly one contributor');
if (magosOnAll !== after.counts.Recipe) problems.push('not every recipe has the magos contributor');
if (joined !== minc) problems.push('magos joinedAt != min(Recipe.createdAt)');
if (nullQty !== after.counts.Ingredient) problems.push('legacy ingredient quantity should be NULL');

await client.end();
if (problems.length) {
  console.error('FAIL:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`PASS: ${Object.keys(hashesBefore).length} pre-existing columns unchanged, counts identical, all recipes attached to magos.`);
