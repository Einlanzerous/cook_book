/**
 * COOK-6 criterion 8: prisma/seed.js guards and canvas sample data.
 * The script is run as a real child process (`node prisma/seed.js`) against a
 * scratch database so exit codes and "nothing deleted" are what is tested.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { describeDb, createScratchDb } from './helpers/db.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describeDb('seed.js (criterion 8)', () => {
  let db;
  const run = (args = [], env = {}) =>
    spawnSync('node', ['prisma/seed.js', ...args], {
      cwd: backendDir,
      env: { ...process.env, NODE_ENV: '', ...env, DATABASE_URL: db.url },
      encoding: 'utf8'
    });
  const counts = async () => ({
    recipes: await db.prisma.recipe.count(),
    contributors: await db.prisma.contributor.count(),
    tags: await db.prisma.tag.count()
  });

  beforeAll(async () => { db = await createScratchDb(); });
  afterAll(async () => { await db?.drop(); });
  beforeEach(async () => {
    // back to the post-migration state: only the default contributor
    await db.prisma.recipe.deleteMany();
    await db.prisma.tag.deleteMany();
    await db.prisma.contributor.deleteMany({ where: { name: { not: 'magos' } } });
    const magos = await db.prisma.contributor.count({ where: { name: 'magos' } });
    if (!magos) await db.prisma.contributor.create({ data: { name: 'magos' } });
  });

  it('runs on a fresh database and writes the canvas sample data as columns', async () => {
    const res = run();
    expect(res.status, res.stderr).toBe(0);

    expect(await counts()).toMatchObject({ recipes: 10, contributors: 6 });
    const names = (await db.prisma.contributor.findMany()).map((c) => c.name);
    expect(names).toContain('magos');                 // the fallback still works
    expect(names).toContain('Mara Okafor');

    const recipes = await db.prisma.recipe.findMany({ include: { ingredients: true, directions: true, tags: true, contributor: true } });
    expect(recipes.every((r) => r.contributorId && r.totalMinutes === r.prepTime + r.cookTime)).toBe(true);
    expect(recipes.every((r) => r.category && r.cuisine)).toBe(true);
    const sources = new Set(recipes.map((r) => r.source));
    expect([...sources].sort()).toEqual(['Added via Claude', 'Grandma Ada’s card', 'HelloFresh', 'NYT Cooking']);
    expect(recipes.filter((r) => r.vegetarian).length).toBe(3);

    // no time, cuisine, category or Vegetarian tags
    const tagNames = (await db.prisma.tag.findMany()).map((t) => t.name);
    for (const banned of ['Vegetarian', 'Veggie', 'Korean', 'Italian', 'Main Course', 'Soup', 'Salad', 'Asian']) {
      expect(tagNames).not.toContain(banned);
    }
    expect(tagNames.some((n) => /Minutes|Hour/.test(n))).toBe(false);

    // COOK-9 edge cases + headings
    const bibimbap = recipes.find((r) => /Bibimbap/.test(r.title));
    const ginger = bibimbap.ingredients.find((i) => i.name === 'Ginger');
    expect(ginger).toMatchObject({ amount: '1 thumb', quantity: null });
    const salt = bibimbap.ingredients.find((i) => i.name === 'Salt & pepper');
    expect(salt.amount).toBeNull();
    expect(bibimbap.ingredients.find((i) => i.name === 'Jasmine rice').quantity).toBe(0.75);
    expect(bibimbap.directions.every((d) => d.heading)).toBe(true);
    expect(bibimbap.notes).toMatch(/Swap in chicken/);
  });

  it('refuses (non-zero, nothing deleted) when a Recipe exists, without --force', async () => {
    await db.prisma.recipe.create({ data: { title: 'Mine' } });
    const before = await counts();
    const res = run();
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/Refusing to seed/);
    expect(await counts()).toEqual(before);
  });

  it('refuses when a non-default Contributor exists, without --force', async () => {
    await db.prisma.contributor.create({ data: { name: 'Someone' } });
    const before = await counts();
    const res = run();
    expect(res.status).not.toBe(0);
    expect(await counts()).toEqual(before);
  });

  it('refuses under NODE_ENV=production, even with --force, even on an empty database', async () => {
    const before = await counts();
    expect(run([], { NODE_ENV: 'production' }).status).not.toBe(0);
    const forced = run(['--force'], { NODE_ENV: 'production' });
    expect(forced.status).not.toBe(0);
    expect(forced.stderr).toMatch(/NODE_ENV=production/);
    expect(await counts()).toEqual(before);

    await db.prisma.recipe.create({ data: { title: 'Real data' } });
    const withData = await counts();
    expect(run(['--force'], { NODE_ENV: 'production' }).status).not.toBe(0);
    expect(await counts()).toEqual(withData);
  });

  it('--force wipes recipes, tags and contributors (including Contributor) and reseeds', async () => {
    await db.prisma.contributor.create({ data: { name: 'Someone' } });
    await db.prisma.recipe.create({ data: { title: 'Doomed', tags: { create: { name: 'Doomed Tag' } } } });
    const res = run(['--force']);
    expect(res.status, res.stderr).toBe(0);
    expect(await counts()).toMatchObject({ recipes: 10, contributors: 6 });
    expect(await db.prisma.recipe.count({ where: { title: 'Doomed' } })).toBe(0);
    expect(await db.prisma.tag.count({ where: { name: 'Doomed Tag' } })).toBe(0);
    expect(await db.prisma.contributor.count({ where: { name: 'Someone' } })).toBe(0);
  });
});
