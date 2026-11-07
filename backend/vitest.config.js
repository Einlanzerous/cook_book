import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js', 'src/**/*.test.js'],
    globalSetup: ['./test/globalSetup.js'],
    // DB-backed tests make their own scratch database each (test/helpers/db.js),
    // so files can run in parallel without sharing rows.
    testTimeout: 30000,
    hookTimeout: 60000
  }
});
