import { HttpError } from '../services/recipeWrite.js';

/**
 * Bounds for the public reads (COOK-41). The app is open to anonymous callers,
 * so every list read is capped and every user-supplied query value is checked
 * before it reaches Prisma. Request-rate limiting is Cloudflare's job (a
 * rate-limiting rule on /api/*); these caps are the backstop behind it.
 */

// Result cap for the three list reads (GET /api/recipes, GET /api/search,
// GET /api/tags/:name/recipes). Hard cap, no pagination: the household library
// is tens of recipes, so 500 is far above it and still bounds a response.
export const MAX_LIST_RESULTS = 500;

// Longest accepted ?q= (search) and ?tag= / :name (tag filter). Tags are short
// labels and search terms are a few words; anything longer is not a real query.
export const MAX_QUERY_LENGTH = 200;
export const MAX_TAG_LENGTH = 100;

// Query keys that may be repeated (an array of strings). Everything else must be
// one plain string. `exclude` is the random picker's id list and is already
// capped by MAX_EXCLUDE.
const REPEATABLE = new Set(['exclude']);

/**
 * express parses the query with qs, so ?tag[a]=b arrives as an object and
 * ?q=a&q=b as an array. Reject those with 400 before any route reads them.
 */
export function queryShapeGuard(req, res, next) {
  try {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') continue;
      if (REPEATABLE.has(key) && Array.isArray(value) && value.every((v) => typeof v === 'string')) continue;
      throw new HttpError(400, `Query parameter "${key}" must be a single string`);
    }
    next();
  } catch (error) {
    next(error);
  }
}

/** A string value (or undefined), 400 when it is over `max` characters. */
export function boundedString(value, name, max) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `Query parameter "${name}" must be a single string`);
  if (value.length > max) throw new HttpError(400, `"${name}" is too long (at most ${max} characters)`);
  return value;
}
