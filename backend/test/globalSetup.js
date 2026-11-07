/**
 * Vitest global setup: the gate in front of every DB-backed test.
 *
 *   COOK_TEST_DATABASE_URL  postgres URL of a server the tests may create and
 *                           drop databases on. Its database name MUST end in
 *                           `_test`; anything else aborts the whole run, so a
 *                           mistyped URL can never point the suite at real data.
 *   COOK_REQUIRE_DB=1       turns "no database configured" from a skip into a
 *                           failure. CI sets it so DB tests cannot silently skip.
 *
 * With neither set the suite runs and DB-backed tests are skipped, so plain
 * `make test` works with no database.
 */
import { parseTestDatabaseUrl } from './helpers/dbUrl.js';

export default async function setup({ provide }) {
  const url = process.env.COOK_TEST_DATABASE_URL;

  if (!url) {
    if (process.env.COOK_REQUIRE_DB === '1') {
      throw new Error(
        'COOK_REQUIRE_DB=1 but COOK_TEST_DATABASE_URL is not set: refusing to skip DB-backed tests.'
      );
    }
    console.warn('[test] COOK_TEST_DATABASE_URL not set: DB-backed tests will be skipped.');
    provide('dbUrl', null);
    return;
  }

  parseTestDatabaseUrl(url); // throws unless the name ends in _test

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query('SELECT 1');
  } catch (err) {
    throw new Error(`COOK_TEST_DATABASE_URL is set but the database is unreachable: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
  provide('dbUrl', url);
}
