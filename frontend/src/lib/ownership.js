/**
 * Which write controls the SPA shows (COOK-23). These mirror the SERVER rule
 * in backend/src/services/ownership.js and are tested against the same
 * shared/ownership-outcomes.json, so the two cannot drift. Hiding a control is
 * presentation only: the server remains the enforcement.
 *
 *   - any signed-in contributor may EDIT any recipe;
 *   - only the recipe's AUTHOR may DELETE it (an unattributed recipe: any
 *     signed-in contributor).
 *
 * `me` is { id, name } or null; `recipe` is the API read shape, where the
 * author is `recipe.contributor.id` (or a bare `contributorId`).
 */
const authorId = (recipe) => recipe?.contributor?.id ?? recipe?.contributorId ?? null

export const canWrite = (me) => Boolean(me)

export const canEdit = (me, recipe) => Boolean(me) && Boolean(recipe)

export function canDelete(me, recipe) {
  if (!me || !recipe) return false
  const author = authorId(recipe)
  return author === null || author === me.id
}
