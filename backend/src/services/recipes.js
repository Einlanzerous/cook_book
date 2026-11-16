/**
 * Recipe service layer (COOK-47). One data path for search, read and create,
 * shared by the REST routes and, later, the MCP tools (COOK-13): the caller
 * passes a Prisma client (and, for writes, the already-authenticated
 * contributor) and gets presented recipes back. No express in here; failures
 * are HttpError so the route error handler and a tool wrapper can both map them.
 */
import { recipeInclude, presentRecipe } from './recipeShape.js';
import { filterWhere } from './randomRecipe.js';
import {
  HttpError,
  normalizeSource,
  processTags,
  tagConnect,
  prepareDirections,
  prepareIngredients,
  scalarData
} from './recipeWrite.js';
import { boundedString, MAX_LIST_RESULTS, MAX_QUERY_LENGTH, MAX_TAG_LENGTH, MAX_ID_LENGTH } from '../middleware/readLimits.js';

/** Length caps on writes (COOK-47). Over any of them is a 400 and nothing is written. */
export const LIMITS = {
  title: 200,
  source: 500,
  ingredientText: 2000, // each ingredient name, amount and unit
  directionText: 2000, // each direction instruction and heading
  ingredients: 100,
  directions: 100,
  tags: 20,
  tagLength: 100
};

const text = (value) => (typeof value === 'string' ? value : String(value));

function capString(value, label, max) {
  if (value !== undefined && value !== null && text(value).length > max) {
    throw new HttpError(400, `${label} is too long (at most ${max} characters)`);
  }
}

function capList(value, label, max) {
  if (!Array.isArray(value)) throw new HttpError(400, `${label} must be an array`);
  if (value.length > max) throw new HttpError(400, `${label} takes at most ${max} items`);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The write validator shared by create and PUT /api/recipes/:id. Checks only
 * the keys present, so a partial update stays partial. Throws HttpError(400).
 */
export function assertWithinLimits(body) {
  if (!isObject(body)) throw new HttpError(400, 'Request body must be a JSON object');
  capString(body.title, 'title', LIMITS.title);
  capString(body.source, 'source', LIMITS.source);

  if (body.ingredients !== undefined) {
    capList(body.ingredients, 'ingredients', LIMITS.ingredients);
    body.ingredients.forEach((ing, i) => {
      if (!isObject(ing)) throw new HttpError(400, `ingredients[${i}] must be an object`);
      capString(ing.name, `ingredients[${i}].name`, LIMITS.ingredientText);
      capString(ing.amount, `ingredients[${i}].amount`, LIMITS.ingredientText);
      capString(ing.unit, `ingredients[${i}].unit`, LIMITS.ingredientText);
    });
  }

  if (body.directions !== undefined) {
    capList(body.directions, 'directions', LIMITS.directions);
    body.directions.forEach((dir, i) => {
      if (typeof dir === 'string') {
        capString(dir, `directions[${i}]`, LIMITS.directionText);
      } else if (isObject(dir)) {
        capString(dir.instruction, `directions[${i}].instruction`, LIMITS.directionText);
        capString(dir.heading, `directions[${i}].heading`, LIMITS.directionText);
      } else {
        throw new HttpError(400, `directions[${i}] must be a string or an object`);
      }
    });
  }

  if (body.tags !== undefined) {
    capList(body.tags, 'tags', LIMITS.tags);
    body.tags.forEach((tag, i) => {
      if (typeof tag === 'string') capString(tag, `tags[${i}]`, LIMITS.tagLength);
    });
  }
}

/**
 * Search. `q` matches title, description, ingredient names and tag names
 * (case-insensitive substring); the other filters are ANDed on top and are all
 * optional. With neither `q` nor any filter the answer is [] (the search box
 * contract). `limit` defaults to, and never exceeds, the 500 REST hard cap; the
 * MCP tool passes a smaller one.
 */
export async function searchRecipes(
  prisma,
  { q, ingredient, tag, contributorId, maxMinutes, vegetarian, limit } = {}
) {
  // The string caps live here so every caller (REST, MCP) inherits them.
  const term = boundedString(q, 'q', MAX_QUERY_LENGTH)?.trim() ?? '';
  const ingredientTerm = boundedString(ingredient, 'ingredient', MAX_QUERY_LENGTH)?.trim() ?? '';
  const tagTerm = boundedString(tag, 'tag', MAX_TAG_LENGTH)?.trim() ?? '';
  boundedString(contributorId, 'contributor', MAX_ID_LENGTH);
  const hasMinutes = maxMinutes !== undefined && maxMinutes !== null;

  if (!term && !ingredientTerm && !tagTerm && !contributorId && !hasMinutes && !vegetarian) return [];

  let take = MAX_LIST_RESULTS;
  if (limit !== undefined && limit !== null) {
    if (!Number.isInteger(limit) || limit < 1) throw new HttpError(400, 'limit must be a positive whole number');
    take = Math.min(limit, MAX_LIST_RESULTS);
  }

  const and = [];
  if (term) {
    const t = term.toLowerCase();
    and.push({
      OR: [
        { title: { contains: t, mode: 'insensitive' } },
        { description: { contains: t, mode: 'insensitive' } },
        { ingredients: { some: { name: { contains: t, mode: 'insensitive' } } } },
        { tags: { some: { name: { contains: t, mode: 'insensitive' } } } }
      ]
    });
  }
  if (ingredientTerm) {
    and.push({ ingredients: { some: { name: { contains: ingredientTerm, mode: 'insensitive' } } } });
  }
  if (tagTerm) {
    and.push({ tags: { some: { name: { equals: tagTerm, mode: 'insensitive' } } } });
  }
  if (contributorId) and.push({ contributorId });
  and.push(await filterWhere(prisma, { vegetarian: Boolean(vegetarian), maxMinutes: hasMinutes ? maxMinutes : null }));

  const recipes = await prisma.recipe.findMany({
    where: { AND: and },
    include: recipeInclude,
    orderBy: { updatedAt: 'desc' },
    take
  });
  return recipes.map(presentRecipe);
}

/** One presented recipe, or null when the id is unknown. */
export async function getRecipe(prisma, id) {
  const recipe = await prisma.recipe.findUnique({ where: { id }, include: recipeInclude });
  return recipe ? presentRecipe(recipe) : null;
}

/**
 * Validate, then create. Attribution is `contributor.id` only; a contributorId
 * in `body` is ignored. All validation runs before the write, so an invalid
 * body leaves no row behind.
 */
export async function createRecipe(prisma, contributor, body) {
  assertWithinLimits(body);
  const tags = processTags(body.tags);
  const data = {
    ...scalarData(body),
    source: normalizeSource(body.source),
    contributorId: contributor.id,
    ingredients: { create: prepareIngredients(body.ingredients || []) },
    directions: { create: prepareDirections(body.directions || []) },
    tags: { connectOrCreate: tagConnect(tags || []) }
  };
  const recipe = await prisma.recipe.create({ data, include: recipeInclude });
  return presentRecipe(recipe);
}
