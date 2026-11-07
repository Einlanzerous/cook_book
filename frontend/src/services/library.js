// Derived numbers for the landing / library screen (COOK-8).
// Everything here is computed from the recipe list and /api/tags; no tag is
// ever invented for "Under 30 min" (it is totalMinutes <= 30).

export const ALL = 'all'
export const UNDER_30 = 'under-30'
export const UNDER_30_LABEL = 'Under 30 min'
export const MAX_TAG_FILTERS = 7

export const isUnder30 = (recipe) => recipe.totalMinutes != null && recipe.totalMinutes <= 30

const hasTag = (recipe, name) =>
  (recipe.tags || []).some((t) => t.name.toLowerCase() === name.toLowerCase())

export function filterRecipes(recipes, filter) {
  if (!filter || filter === ALL) return recipes
  if (filter === UNDER_30) return recipes.filter(isUnder30)
  return recipes.filter((r) => hasTag(r, filter))
}

/** Distinct cooks who have at least one recipe in the list. */
export function cookCount(recipes) {
  return new Set(recipes.map((r) => r.contributor?.id).filter(Boolean)).size
}

/**
 * Filter row: All, Under 30 min, then the most-used tags. Tag counts come from
 * /api/tags (zero-count tags are already omitted server-side).
 */
export function buildFilters(recipes, tags) {
  const topTags = [...tags]
    .filter((t) => t.recipeCount > 0)
    .sort((a, b) => b.recipeCount - a.recipeCount || a.name.localeCompare(b.name))
    .slice(0, MAX_TAG_FILTERS)
    .map((t) => ({ key: t.name, label: t.name, count: t.recipeCount }))
  return [
    { key: ALL, label: 'All', count: recipes.length },
    { key: UNDER_30, label: UNDER_30_LABEL, count: recipes.filter(isUnder30).length },
    ...topTags
  ]
}

/**
 * Featured pick rule: the most recently added recipe that has a photo, else the
 * most recently added. `recipes` arrive newest first (sort=createdAt).
 */
export function pickFeatured(recipes) {
  return recipes.find((r) => r.imageUrl) || recipes[0] || null
}

/** "source · contributor", omitting whichever is missing ('manual' has no sourceLabel). */
export function byline(recipe) {
  return [recipe.sourceLabel, recipe.contributor?.name].filter(Boolean).join(' · ')
}

/** "30 min · serves 2", omitting whichever is missing. */
export function metaLine(recipe) {
  const parts = []
  if (recipe.totalMinutes) parts.push(`${recipe.totalMinutes} min`)
  if (recipe.servings) parts.push(`serves ${recipe.servings}`)
  return parts.join(' · ')
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
