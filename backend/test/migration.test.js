/**
 * COOK-6 criteria 1, 3, 11 (fixture parts): the contributors migration applied
 * to (a) an empty database and (b) a synthetic pre-migration fixture.
 * DB-backed: skipped without COOK_TEST_DATABASE_URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import { describeDb, createBareDb, createScratchDb, migrationsDir } from './helpers/db.js';

const dirs = fs.readdirSync(migrationsDir).filter((d) => /^\d{14}_/.test(d)).sort();
const target = dirs.find((d) => d.endsWith('contributors_and_recipe_metadata'));
const before = dirs.slice(0, dirs.indexOf(target));
const sql = (d) => fs.readFileSync(path.join(migrationsDir, d, 'migration.sql'), 'utf8');
const fixture = fs.readFileSync(new URL('./fixtures/pre-migration.sql', import.meta.url), 'utf8');

async function schema(client) {
  const { rows } = await client.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = 'public'
    ORDER BY table_name, column_name`);
  return rows;
}
const key = (r) => `${r.table_name}.${r.column_name}`;

describe('migration SQL text (no database needed)', () => {
  const stripped = sql(target)
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

  it('is additive: no DROP, RENAME or ALTER COLUMN ... TYPE', () => {
    expect(stripped).not.toMatch(/\bDROP\b/i);
    expect(stripped).not.toMatch(/\bRENAME\b/i);
    expect(stripped).not.toMatch(/ALTER\s+COLUMN/i);
  });

  it('has no text-to-number cast and no division by a column', () => {
    expect(stripped).not.toMatch(/\bCAST\s*\(/i);
    // the only cast allowed is ::numeric on the prep+cook sum
    const casts = stripped.match(/::\w+/g) || [];
    expect(casts.filter((c) => c !== '::numeric' && c !== '::text')).toEqual([]);
    expect(stripped).not.toMatch(/\/\s*"/);
    expect(stripped).not.toMatch(/\/\s*\(?\s*\w*\."/);
    expect(stripped).toMatch(/::numeric \/ 3\b/);
  });

  it('names the default contributor literally and takes its id from gen_random_uuid()', () => {
    expect(stripped).toContain("'magos'");
    expect(stripped).toContain('gen_random_uuid()');
  });
});

describeDb('migration on an empty database', () => {
  let db;
  beforeAll(async () => { db = await createScratchDb(); });
  afterAll(async () => { await db?.drop(); });

  it('creates exactly one default contributor, joinedAt ~ now', async () => {
    const cs = await db.prisma.contributor.findMany();
    expect(cs).toHaveLength(1);
    expect(cs[0].name).toBe('magos');
    expect(cs[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Math.abs(Date.now() - cs[0].joinedAt.getTime())).toBeLessThan(5 * 60 * 1000);
  });
});

describeDb('migration on the synthetic pre-migration fixture', () => {
  let db;
  let schemaBefore;
  let rowsBefore;
  const tables = ['Recipe', 'Ingredient', 'Direction', 'Tag', '_RecipeTags'];
  const snap = async () => {
    const out = {};
    for (const t of tables) {
      out[t] = (await db.client.query(`SELECT * FROM "${t}" ORDER BY 1, 2`)).rows;
    }
    return out;
  };

  beforeAll(async () => {
    db = await createBareDb();
    // a non-UTC session proves the joinedAt conversion does not depend on TimeZone
    await db.client.query("SET TIME ZONE 'America/Los_Angeles'");
    for (const d of before) await db.client.query(sql(d));
    await db.client.query(fixture);
    schemaBefore = await schema(db.client);
    rowsBefore = await snap();
    await db.client.query(sql(target));
  });
  afterAll(async () => { await db?.drop(); });

  it('drops, renames and retypes nothing (information_schema before/after)', async () => {
    const after = await schema(db.client);
    const afterByKey = new Map(after.map((r) => [key(r), r]));
    for (const b of schemaBefore) {
      const a = afterByKey.get(key(b));
      expect(a, `${key(b)} vanished`).toBeTruthy();
      expect(a.data_type, key(b)).toBe(b.data_type);
      expect(a.is_nullable, key(b)).toBe(b.is_nullable);
      expect(a.column_default, key(b)).toBe(b.column_default);
    }
    const newCols = after.filter((r) => !schemaBefore.some((b) => key(b) === key(r))).map(key);
    expect(newCols.sort()).toEqual([
      'Contributor.bio', 'Contributor.email', 'Contributor.externalId', 'Contributor.id',
      'Contributor.joinedAt', 'Contributor.name', 'Contributor.portraitUrl',
      'Direction.heading', 'Ingredient.quantity',
      'Recipe.category', 'Recipe.contributorId', 'Recipe.cuisine', 'Recipe.notes',
      'Recipe.timeSplitEstimated', 'Recipe.totalMinutes', 'Recipe.vegetarian'
    ].sort());
  });

  it('leaves every pre-existing value byte-identical (source, createdAt, updatedAt, amounts...)', async () => {
    const after = await snap();
    for (const t of tables) {
      const cols = Object.keys(rowsBefore[t][0] || {});
      const projected = after[t].map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
      expect(projected, t).toEqual(rowsBefore[t]);
    }
    const { rows } = await db.client.query(`SELECT source FROM "Recipe" WHERE id = 'r-hf-space'`);
    expect(rows[0].source).toBe('HelloFresh ');
  });

  it('adds one default contributor "magos" and attaches every recipe to it', async () => {
    const { rows: cs } = await db.client.query('SELECT * FROM "Contributor"');
    expect(cs).toHaveLength(1);
    expect(cs[0].name).toBe('magos');
    const { rows } = await db.client.query(`SELECT count(*)::int AS n FROM "Recipe" WHERE "contributorId" = $1`, [cs[0].id]);
    expect(rows[0].n).toBe(8);
  });

  it('joinedAt = min(Recipe.createdAt) as a UTC instant, under a non-UTC session', async () => {
    const { rows } = await db.client.query(`SHOW TimeZone`);
    expect(rows[0].TimeZone).toBe('America/Los_Angeles');
    const { rows: cs } = await db.client.query('SELECT "joinedAt" FROM "Contributor"');
    expect(cs[0].joinedAt.toISOString()).toBe('2026-01-05T10:00:00.000Z');
    const { rows: t } = await db.client.query(`SELECT pg_typeof("joinedAt")::text AS t FROM "Contributor"`);
    expect(t[0].t).toBe('timestamp with time zone');
  });

  it('totalMinutes = prep+cook where either is set, NULL where neither', async () => {
    const { rows } = await db.client.query('SELECT id, "totalMinutes" FROM "Recipe"');
    const m = Object.fromEntries(rows.map((r) => [r.id, r.totalMinutes]));
    expect(m).toEqual({
      'r-hf-lower': 30, 'r-hf-space': 15, 'r-hf-nomatch': 20, 'r-man-url': 30,
      'r-man-bare': null, 'r-hf-prepnly': 20, 'r-hf-zero': 0, 'r-veg': 12
    });
  });

  it('timeSplitEstimated is true only for HelloFresh rows whose split is round(total/3) (criterion 11)', async () => {
    const { rows } = await db.client.query('SELECT id, "timeSplitEstimated" FROM "Recipe" ORDER BY id');
    const m = Object.fromEntries(rows.map((r) => [r.id, r.timeSplitEstimated]));
    expect(m['r-hf-lower']).toBe(true);   // 10/20
    expect(m['r-hf-space']).toBe(true);   // 'HelloFresh ' 5/10
    expect(m['r-hf-nomatch']).toBe(false); // 10/10
    expect(m['r-man-url']).toBe(false);   // manual, 15/15
    expect(m['r-hf-prepnly']).toBe(false);
    expect(m['r-hf-zero']).toBe(false);
    expect(m['r-man-bare']).toBe(false);
    expect(m['r-veg']).toBe(false);
  });

  it('vegetarian is true iff a tag lower(name) is vegetarian/veggie', async () => {
    const { rows } = await db.client.query('SELECT id, vegetarian FROM "Recipe" ORDER BY id');
    const trues = rows.filter((r) => r.vegetarian).map((r) => r.id).sort();
    expect(trues).toEqual(['r-man-bare', 'r-man-url', 'r-veg']);
  });

  it('leaves heading, quantity, category, cuisine, notes NULL on pre-existing rows', async () => {
    const r = await db.client.query(
      'SELECT count(*)::int AS n FROM "Recipe" WHERE category IS NOT NULL OR cuisine IS NOT NULL OR notes IS NOT NULL');
    expect(r.rows[0].n).toBe(0);
    expect((await db.client.query('SELECT count(*)::int AS n FROM "Direction" WHERE heading IS NOT NULL')).rows[0].n).toBe(0);
    expect((await db.client.query('SELECT count(*)::int AS n FROM "Ingredient" WHERE quantity IS NOT NULL')).rows[0].n).toBe(0);
  });

  it('creates the expression and column indexes (criterion 5)', async () => {
    const { rows } = await db.client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('Recipe','Contributor')`);
    const defs = rows.map((r) => r.indexdef).join('\n');
    expect(defs).toMatch(/"Recipe_contributorId_idx"/);
    expect(defs).toMatch(/"Recipe_totalMinutes_idx"/);
    expect(defs).toMatch(/CREATE INDEX "Recipe_lower_source_idx" ON public\."Recipe" USING btree \(lower\(source\)\)/);
    expect(defs).toMatch(/CREATE UNIQUE INDEX "Contributor_lower_name_key" ON public\."Contributor" USING btree \(lower\(name\)\)/);
  });
});
