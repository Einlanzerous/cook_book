/**
 * Who may change a recipe (COOK-23 rulings):
 *   - Ownership: any signed-in contributor may EDIT any recipe; only the
 *     recipe's AUTHOR may DELETE it.
 *   - Unattributed recipes (NULL contributorId): any signed-in contributor may
 *     edit and delete.
 *
 * The expected outcomes live in shared/ownership-outcomes.json at the repo
 * root, which the backend handler tests and the frontend canEdit/canDelete
 * tests both iterate, so the two rules cannot drift. If this file changes,
 * so must that fixture (and frontend/src/lib/ownership.js).
 */
import { HttpError } from './recipeWrite.js';

export function canEdit(contributor /* { id } | null */, recipe) {
  return Boolean(contributor) && Boolean(recipe);
}

export function canDelete(contributor, recipe) {
  if (!contributor || !recipe) return false;
  if (recipe.contributorId == null) return true;
  return recipe.contributorId === contributor.id;
}

export function assertCanEdit(contributor, recipe) {
  if (!canEdit(contributor, recipe)) throw new HttpError(403, 'You cannot edit this recipe');
}

export function assertCanDelete(contributor, recipe) {
  if (!canDelete(contributor, recipe)) throw new HttpError(403, 'Only the author can delete this recipe');
}
