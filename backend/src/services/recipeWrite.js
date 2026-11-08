/**
 * Write-path helpers shared by POST/PUT /api/recipes and the HelloFresh import
 * (COOK-6). Pure functions plus the contributor lookup; no express here.
 */
import { prepareIngredient } from './quantity.js';

/** The legacy owner row. Used by the seed only; attribution comes from the signed-in caller (COOK-23). */
export const DEFAULT_CONTRIBUTOR_NAME = 'magos';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function toTitleCase(str) {
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** undefined stays undefined (field omitted), blank becomes null, otherwise trimmed. */
function cleanText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/** Category/cuisine are free text, Title-Cased on write (never a tag). */
function cleanTitleCased(value) {
  const s = cleanText(value);
  return typeof s === 'string' ? toTitleCase(s) : s;
}

/**
 * Stored source: trimmed, and 'manual' (meaning "no source label") when missing
 * or blank. The REST layer stays permissive: COOK-13's tool schema and COOK-10's
 * form are where a real source is required.
 */
export function normalizeSource(source) {
  const s = cleanText(source);
  return s ?? 'manual';
}

/**
 * Tag names: trimmed, Title-Cased, de-duplicated. The write path no longer adds
 * time-bucket, cuisine, category or 'Vegetarian' tags (those are columns).
 * Returns undefined when `tags` was omitted so a PUT leaves tags unchanged.
 */
export function processTags(tags) {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) throw new HttpError(400, 'tags must be an array of strings');
  const names = tags
    .filter((t) => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
    .map(toTitleCase);
  return [...new Set(names)];
}

export const tagConnect = (names) =>
  names.map((name) => ({ where: { name }, create: { name } }));

/**
 * Direction rows. Items may be strings or {instruction, heading?, stepNumber?}.
 * stepNumber is the position. A heading the client did not mention (no
 * `heading` key, e.g. an old-shape body) is carried over from the existing
 * direction at the same position, so an old-shape PUT cannot wipe headings.
 */
export function prepareDirections(directions, existing = []) {
  const byStep = new Map(existing.map((d) => [d.stepNumber, d.heading]));
  return directions.map((dir, index) => {
    const stepNumber = index + 1;
    if (typeof dir === 'string') {
      return { stepNumber, instruction: dir, heading: byStep.get(stepNumber) ?? null };
    }
    const hasHeading = Object.prototype.hasOwnProperty.call(dir, 'heading');
    return {
      stepNumber,
      instruction: dir.instruction,
      heading: hasHeading ? cleanText(dir.heading) : (byStep.get(stepNumber) ?? null)
    };
  });
}

export const prepareIngredients = (ingredients) => ingredients.map(prepareIngredient);

/**
 * Scalar column data for create/update from a request body. Only keys the
 * client actually sent are included (so PUT is a partial update).
 * `existing` supplies the stored prep/cook when deriving totalMinutes.
 */
export function scalarData(body, existing = null) {
  const data = {};
  for (const k of ['title', 'description', 'imageUrl', 'servings', 'prepTime', 'cookTime', 'sourceUrl']) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (body.notes !== undefined) data.notes = cleanText(body.notes);
  if (body.category !== undefined) data.category = cleanTitleCased(body.category);
  if (body.cuisine !== undefined) data.cuisine = cleanTitleCased(body.cuisine);
  if (body.vegetarian !== undefined) data.vegetarian = Boolean(body.vegetarian);
  if (body.timeSplitEstimated !== undefined) data.timeSplitEstimated = Boolean(body.timeSplitEstimated);

  if (body.totalMinutes !== undefined) {
    data.totalMinutes = body.totalMinutes;
  } else if (body.prepTime !== undefined || body.cookTime !== undefined) {
    const prep = body.prepTime !== undefined ? body.prepTime : existing?.prepTime;
    const cook = body.cookTime !== undefined ? body.cookTime : existing?.cookTime;
    data.totalMinutes = prep == null && cook == null ? null : (prep ?? 0) + (cook ?? 0);
  }
  return data;
}
