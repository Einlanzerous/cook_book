/**
 * Random recipe picker (COOK-12). Shared by GET /api/recipes/random and, later,
 * the MCP `random_recipe` tool (COOK-13): one rule set, one data path.
 *
 * Rules:
 *  - `vegetarian` filters on the Recipe.vegetarian column, never on tags.
 *  - `maxMinutes` filters on totalMinutes <= N; a NULL total falls back to
 *    prep + cook (see filterWhere); recipes with no time at all are out.
 *  - `exclude` is a "not these" list (the client sends the recipe it just
 *    showed, so a reroll never repeats). It is soft in exactly one case: if the
 *    filters match only recipes that are excluded (a one-recipe library, say),
 *    the pick falls back to them rather than reporting an empty library.
 *  - Randomness is a count plus a random offset, so nothing is loaded just to
 *    be thrown away and it scales past what any page has loaded.
 */
import { recipeInclude, presentRecipe } from './recipeShape.js';

export const MAX_EXCLUDE = 50;

/**
 * Same rule as presentRecipe and the library's "Under 30 min": the stored
 * totalMinutes wins, and a NULL total (a row written by an image that predates
 * the column) falls back to prep + cook, with a missing part counting as 0. Prisma cannot compare a sum of
 * columns, so the matching ids come from one raw query.
 */
export async function filterWhere(prisma, { vegetarian = false, maxMinutes = null } = {}) {
  const where = {};
  if (vegetarian) where.vegetarian = true;
  if (maxMinutes != null) {
    const rows = await prisma.$queryRaw`
      SELECT id FROM "Recipe"
      WHERE COALESCE("totalMinutes",
        CASE WHEN "prepTime" IS NULL AND "cookTime" IS NULL THEN NULL
             ELSE COALESCE("prepTime", 0) + COALESCE("cookTime", 0) END) <= ${maxMinutes}`;
    where.AND = [{ id: { in: rows.map((r) => r.id) } }];
  }
  return where;
}

/**
 * @returns {Promise<{ recipe: object|null, matches: number }>}
 *   matches = how many recipes satisfy the filters, ignoring `exclude`.
 */
export async function pickRandomRecipe(prisma, { vegetarian = false, maxMinutes = null, exclude = [] } = {}, rng = Math.random) {
  const where = await filterWhere(prisma, { vegetarian, maxMinutes });
  const matches = await prisma.recipe.count({ where });
  if (matches === 0) return { recipe: null, matches: 0 };

  let pool = where;
  let poolSize = matches;
  if (exclude.length) {
    const narrowed = { ...where, id: { notIn: exclude } };
    const n = await prisma.recipe.count({ where: narrowed });
    if (n > 0) {
      pool = narrowed;
      poolSize = n;
    }
  }

  const skip = Math.min(poolSize - 1, Math.floor(rng() * poolSize));
  const recipe = await prisma.recipe.findFirst({
    where: pool,
    orderBy: { id: 'asc' },
    skip,
    include: recipeInclude
  });
  return { recipe: presentRecipe(recipe), matches };
}
