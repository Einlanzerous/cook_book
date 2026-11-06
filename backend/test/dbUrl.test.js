import { describe, it, expect } from 'vitest';
import { parseTestDatabaseUrl } from './helpers/dbUrl.js';

describe('parseTestDatabaseUrl', () => {
  it('accepts a *_test database', () => {
    expect(parseTestDatabaseUrl('postgres://u@127.0.0.1:55540/cook_book_test?x=1').name).toBe('cook_book_test');
  });
  it.each(['postgres://u@h/recipe_book', 'postgres://u@h/cook_book_test_x', 'postgres://u@h/', 'nonsense'])(
    'refuses %s',
    (url) => expect(() => parseTestDatabaseUrl(url)).toThrow()
  );
});
