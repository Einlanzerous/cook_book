/**
 * Read shape for recipes (COOK-6). One include and one presenter shared by the
 * list, detail, tag, search and import responses so they cannot drift.
 *
 * Everything is additive: `source` is returned exactly as stored (a stale
 * cached frontend bundle compares it), `sourceLabel` is the derived display
 * value. Consumers that group or count sources must group on
 * lower(trim(source)) and exclude 'manual' (binding on COOK-8/11).
 */

export const recipeInclude = {
  ingredients: true,
  directions: { orderBy: { stepNumber: 'asc' } },
  tags: true,
  contributor: {
    select: { id: true, name: true, bio: true, portraitUrl: true, joinedAt: true }
  }
};

/** Display name for a stored source, or null for no label ('manual' / blank). */
export function sourceLabel(source) {
  const s = (source ?? '').trim();
  if (!s || s.toLowerCase() === 'manual') return null;
  if (s.toLowerCase() === 'hellofresh') return 'HelloFresh';
  return s;
}

export function presentRecipe(recipe) {
  if (!recipe) return recipe;
  const hasParts = recipe.prepTime != null || recipe.cookTime != null;
  return {
    ...recipe,
    contributor: recipe.contributor ?? null,
    sourceLabel: sourceLabel(recipe.source),
    totalMinutes: recipe.totalMinutes ?? (hasParts ? (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0) : null)
  };
}

/**
 * Legacy time-bucket tags, kept only so old rows can be read. Nothing writes
 * these any more; 'Under 30 min' is derived from totalMinutes <= 30 (the union
 * of the old '15 Minutes' and '30 Minutes' buckets).
 *   <=15 '15 Minutes', <=30 '30 Minutes', <=45 '45 Minutes',
 *   <=60 '1 Hour', else '1 Hour+'
 */
export function legacyTimeBucket(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return null;
  if (totalMinutes <= 15) return '15 Minutes';
  if (totalMinutes <= 30) return '30 Minutes';
  if (totalMinutes <= 45) return '45 Minutes';
  if (totalMinutes <= 60) return '1 Hour';
  return '1 Hour+';
}

export const isUnder30 = (totalMinutes) => totalMinutes != null && totalMinutes <= 30;
