/**
 * Scratch databases for DB-backed tests.
 *
 *   import { describeDb, createScratchDb } from './helpers/db.js';
 *
 *   describeDb('thing', () => {
 *     let db;
 *     beforeAll(async () => { db = await createScratchDb(); });   // fresh, migrated
 *     afterAll(() => db.drop());
 *     it('...', async () => { await db.prisma.recipe.findMany(); });
 *   });
 *
 * `describeDb` is describe.skip when no COOK_TEST_DATABASE_URL is configured
 * (the globalSetup fails the run instead when COOK_REQUIRE_DB=1).
 * Each scratch db is named `cook_scratch_<random>_test`, created on the server
 * COOK_TEST_DATABASE_URL points at, migrated with `prisma migrate deploy`.
 */
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, inject } from 'vitest';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { parseTestDatabaseUrl } from './dbUrl.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const testDbUrl = () => inject('dbUrl');

export function describeDb(name, fn) {
  return (testDbUrl() ? describe : describe.skip)(name, fn);
}

export async function createScratchDb() {
  const adminUrl = testDbUrl();
  if (!adminUrl) throw new Error('No COOK_TEST_DATABASE_URL: use describeDb() so this is skipped.');
  const { parsed } = parseTestDatabaseUrl(adminUrl);

  const name = `cook_scratch_${randomBytes(6).toString('hex')}_test`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const u = new URL(parsed);
  u.pathname = `/${name}`;
  u.search = '';
  const url = u.toString();

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe'
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  return {
    name,
    url,
    prisma,
    async drop() {
      await prisma.$disconnect();
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      try {
        await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await c.end();
      }
    }
  };
}
