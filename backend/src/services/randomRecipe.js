/**
 * Random recipe picker (COOK-12). Shared by GET /api/recipes/random and, later,
 * the MCP `random_recipe` tool (COOK-13): one rule set, one data path.
 *
 * Rules:
 *  - `vegetarian` filters on the Recipe.vegetarian column, never on tags.
 *  - `maxMinutes` filters on totalMinutes <= N; recipes with no total are out.
 *  - `exclude` is a "not these" list (the client sends the recipe it just
 *    showed, so a reroll never repeats). It is soft in exactly one case: if the
 *    filters match only recipes that are excluded (a one-recipe library, say),
 *    the pick falls back to them rather than reporting an empty library.
 *  - Randomness is a count plus a random offset, so nothing is loaded just to
 *    be thrown away and it scales past what any page has loaded.
 */
import { recipeInclude, presentRecipe } from './recipeShape.js';

export const MAX_EXCLUDE = 50;

export function filterWhere({ vegetarian = false, maxMinutes = null } = {}) {
  const where = {};
  if (vegetarian) where.vegetarian = true;
  if (maxMinutes != null) where.totalMinutes = { lte: maxMinutes };
  return where;
}

/**
 * @returns {Promise<{ recipe: object|null, matches: number }>}
 *   matches = how many recipes satisfy the filters, ignoring `exclude`.
 */
export async function pickRandomRecipe(prisma, { vegetarian = false, maxMinutes = null, exclude = [] } = {}, rng = Math.random) {
  const where = filterWhere({ vegetarian, maxMinutes });
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
