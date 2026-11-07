import { it, expect, beforeAll, afterAll } from 'vitest';
import { describeDb, createScratchDb } from './helpers/db.js';

describeDb('scratch database harness', () => {
  let db;
  beforeAll(async () => { db = await createScratchDb(); });
  afterAll(async () => { await db?.drop(); });

  it('creates a migrated *_test database that the Prisma client can use', async () => {
    expect(db.name.endsWith('_test')).toBe(true);
    expect(await db.prisma.recipe.count()).toBe(0);
    const r = await db.prisma.recipe.create({ data: { title: 'Toast' } });
    expect(await db.prisma.recipe.count()).toBe(1);
    expect(r.title).toBe('Toast');
  });
});
