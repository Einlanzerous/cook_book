/** Parse a postgres URL and refuse it unless its database name ends in `_test`. */
export function parseTestDatabaseUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('COOK_TEST_DATABASE_URL is not a valid URL.');
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run: database name "${name}" does not end in "_test". ` +
        'The test suite creates and drops databases; point COOK_TEST_DATABASE_URL at a *_test database.'
    );
  }
  return { parsed, name };
}
