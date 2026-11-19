/**
 * The Commonplace MCP server (COOK-49): five tools over the same service layer
 * as the REST API. It holds no transport and reads no environment; http.js and
 * stdio.js wrap it.
 *
 *   createMcpServer({ prisma, caller, publicOrigin, ... })
 *
 * `caller` is the verified `{ email, sub }` of the request (or null). Reads
 * ignore it. `create_recipe` resolves it with the read-only
 * findBoundContributor and files the recipe under that contributor; it never
 * creates a contributor and never binds an identity.
 *
 * `prisma: null` is the stdio measurement build (stdio.js): the tool list is
 * complete, and any call answers an error. Nothing below imports Prisma, so
 * that build needs no generated client and no database.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchRecipes, getRecipe, createRecipe, LIMITS } from '../services/recipes.js';
import { pickRandomRecipe, MAX_EXCLUDE } from '../services/randomRecipe.js';
import { listContributors } from '../services/contributors.js';
import { HttpError, isBlankSource } from '../services/recipeWrite.js';
import { bodyFromJsonLd } from '../services/recipeJsonLd.js';
import { MAX_QUERY_LENGTH, MAX_TAG_LENGTH, MAX_ID_LENGTH } from '../middleware/readLimits.js';
import { scaleIngredient } from '../../../shared/quantity.js';
import { findBoundContributor } from './caller.js';

export const SEARCH_LIMIT = 25;
const MAX_MINUTES = 100000;
const MAX_SERVES = 1000;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const toolError = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

/** The tool descriptions double as the agent-facing documentation. */
const DESCRIPTIONS = {
  search_recipes:
    'Search the recipe library. Matches q against title, description, ingredient names and tags; the other filters narrow the result. ' +
    'With no filter at all the result is empty. Returns at most 25 summary rows (id, title, minutes, vegetarian, contributor, tags); call get_recipe for the full recipe.',
  get_recipe:
    'Get one full recipe by id. Pass serves to scale ingredient quantities to that many servings; ingredients with no numeric quantity are returned as written and flagged scaled=false.',
  random_recipe:
    'Pick one random recipe, optionally vegetarian and/or within a time limit. exclude lists recipe ids not to repeat. Returns the recipe (null when nothing matches) and how many recipes matched.',
  list_contributors: 'List the people who add recipes, with how many recipes each has. No contact details are returned.',
  create_recipe:
    'File a new recipe under the signed-in caller. `source` is REQUIRED and must say where the recipe comes from ' +
    '(a cookbook, a site, a person, e.g. "Salt Fat Acid Heat" or "Gran"); a blank source or the word "manual" is refused. ' +
    'Only people who have already signed in to Commonplace on the web can file recipes; anyone else gets an error saying so. ' +
    `Limits: title ${LIMITS.title} characters, source ${LIMITS.source}, ingredients ${LIMITS.ingredients}, directions ${LIMITS.directions}, ` +
    `each ingredient or direction text ${LIMITS.directionText}, tags ${LIMITS.tags} (each ${LIMITS.tagLength}). ` +
    'Instead of title, ingredients, directions and the rest you may pass `jsonld`: one schema.org/Recipe (an object or its JSON text, bare or in @graph); `source` is still required. Returns the new id and its public URL.'
};

const ingredientSchema = z.object({
  name: z.string().min(1).max(LIMITS.ingredientText),
  amount: z.string().max(LIMITS.ingredientText).optional(),
  unit: z.string().max(LIMITS.ingredientText).optional()
});

const directionSchema = z.union([
  z.string().min(1).max(LIMITS.directionText),
  z.object({ instruction: z.string().min(1).max(LIMITS.directionText), heading: z.string().max(LIMITS.directionText).optional() })
]);

/** The tool definitions: schemas, annotations, descriptions. No behaviour. */
export const TOOL_DEFS = {
  search_recipes: {
    title: 'Search recipes',
    description: DESCRIPTIONS.search_recipes,
    inputSchema: {
      q: z.string().max(MAX_QUERY_LENGTH).optional(),
      ingredient: z.string().max(MAX_QUERY_LENGTH).optional(),
      tag: z.string().max(MAX_TAG_LENGTH).optional(),
      contributor: z.string().max(MAX_ID_LENGTH).optional().describe('A contributor name or id'),
      maxMinutes: z.number().int().min(1).max(MAX_MINUTES).optional(),
      vegetarian: z.boolean().optional(),
      limit: z.number().int().min(1).max(SEARCH_LIMIT).optional()
    },
    annotations: { title: 'Search recipes', ...READ_ONLY }
  },
  get_recipe: {
    title: 'Get a recipe',
    description: DESCRIPTIONS.get_recipe,
    inputSchema: {
      id: z.string().min(1).max(MAX_ID_LENGTH),
      serves: z.number().int().min(1).max(MAX_SERVES).optional()
    },
    annotations: { title: 'Get a recipe', ...READ_ONLY }
  },
  random_recipe: {
    title: 'Random recipe',
    description: DESCRIPTIONS.random_recipe,
    inputSchema: {
      vegetarian: z.boolean().optional(),
      maxMinutes: z.number().int().min(1).max(MAX_MINUTES).optional(),
      exclude: z.array(z.string().min(1).max(MAX_ID_LENGTH)).max(MAX_EXCLUDE).optional()
    },
    annotations: { title: 'Random recipe', ...READ_ONLY, idempotentHint: false }
  },
  list_contributors: {
    title: 'List contributors',
    description: DESCRIPTIONS.list_contributors,
    inputSchema: {},
    annotations: { title: 'List contributors', ...READ_ONLY }
  },
  create_recipe: {
    title: 'Create a recipe',
    description: DESCRIPTIONS.create_recipe,
    inputSchema: {
      title: z.string().min(1).max(LIMITS.title).optional().describe('Required unless jsonld is given'),
      jsonld: z.union([z.string(), z.record(z.string(), z.unknown())]).optional().describe('schema.org/Recipe JSON-LD; replaces the recipe fields'),
      source: z.string().max(LIMITS.source).describe('Where the recipe comes from. Required; not blank, not "manual".'),
      ingredients: z.array(ingredientSchema).max(LIMITS.ingredients).optional(),
      directions: z.array(directionSchema).max(LIMITS.directions).optional(),
      tags: z.array(z.string().max(LIMITS.tagLength)).max(LIMITS.tags).optional(),
      prepTime: z.number().int().min(0).max(MAX_MINUTES).optional().describe('Minutes'),
      cookTime: z.number().int().min(0).max(MAX_MINUTES).optional().describe('Minutes'),
      servings: z.number().int().min(1).max(MAX_SERVES).optional(),
      vegetarian: z.boolean().optional()
    },
    annotations: { title: 'Create a recipe', ...WRITE }
  }
};

export const TOOL_NAMES = Object.keys(TOOL_DEFS);

/** summary row for search_recipes: never a full recipe. */
export const summarise = (r) => ({
  id: r.id,
  title: r.title,
  minutes: r.totalMinutes ?? null,
  vegetarian: Boolean(r.vegetarian),
  contributor: r.contributor?.name ?? null,
  tags: (r.tags ?? []).map((t) => t.name)
});

/** Scale a presented recipe's ingredients the way the web recipe page does. */
export function scaleRecipe(recipe, serves) {
  const base = recipe.servings || 2; // IngredientList.vue: `props.baseServings || 2`
  const multiplier = serves / base;
  return {
    ...recipe,
    servedFor: serves,
    scaledFrom: base,
    ingredients: recipe.ingredients.map((ing) => {
      const s = scaleIngredient(ing, multiplier);
      return { ...ing, amount: s.amount, unit: s.unit, scaled: s.scaled };
    })
  };
}

/**
 * @param {object} deps
 * @param {object|null} deps.prisma    null = stdio measurement build
 * @param {{email:string,sub:string}|null} [deps.caller]
 * @param {string} [deps.publicOrigin]
 * @param {Function} [deps.log]
 * @param {Function} [deps.rng]        injected in tests for random_recipe
 * @param {Function} [deps.createRecipe]  the write service (injectable for tests)
 */
export function createMcpServer({
  prisma,
  caller = null,
  publicOrigin = '',
  log = console.log,
  rng = Math.random,
  createRecipe: create = createRecipe,
  version = 'dev'
}) {
  const server = new McpServer({ name: 'commonplace', version });

  // One wrapper for every tool: timing, one log line, and error mapping. An
  // HttpError carries a message written for the caller; anything else is
  // replaced by a fixed one, and only its class and code are logged (a Prisma
  // message can quote the arguments, which are never logged).
  const register = (name, handler) => {
    const def = TOOL_DEFS[name];
    server.registerTool(name, def, async (args) => {
      const started = Date.now();
      let callerId = 'unknown';
      const ctx = { setCaller: (id) => { callerId = id; } };
      const done = (status) => log(`mcp.call tool=${name} caller=${callerId} ${status} ms=${Date.now() - started}`);
      if (!prisma) {
        done('error');
        return toolError('This stdio build only lists tools; connect over HTTP to call them.');
      }
      try {
        const result = await handler(args ?? {}, ctx);
        done(result.isError ? 'error' : 'ok');
        return result;
      } catch (err) {
        done('error');
        if (err instanceof HttpError) return toolError(err.message);
        log(`mcp.error tool=${name} name=${err?.name ?? 'Error'} code=${err?.code ?? '-'}`);
        return toolError('internal error');
      }
    });
  };

  register('search_recipes', async (a) => {
    let contributorId;
    if (a.contributor !== undefined && a.contributor.trim() !== '') {
      const term = a.contributor.trim();
      const hit =
        (await prisma.contributor.findUnique({ where: { id: term }, select: { id: true } })) ??
        (await prisma.contributor.findFirst({ where: { name: { equals: term, mode: 'insensitive' } }, select: { id: true } }));
      if (!hit) return toolError(`No contributor matches "${term}". Call list_contributors for the names.`);
      contributorId = hit.id;
    }
    // Omitted arguments stay undefined: the service rejects null.
    const rows = await searchRecipes(prisma, {
      q: a.q,
      ingredient: a.ingredient,
      tag: a.tag,
      contributorId,
      maxMinutes: a.maxMinutes,
      vegetarian: a.vegetarian === true,
      limit: Math.min(a.limit ?? SEARCH_LIMIT, SEARCH_LIMIT)
    });
    return json({ count: rows.length, recipes: rows.map(summarise) });
  });

  register('get_recipe', async (a) => {
    const recipe = await getRecipe(prisma, a.id);
    if (!recipe) return toolError(`No recipe with id "${a.id}".`);
    return json(a.serves === undefined ? recipe : scaleRecipe(recipe, a.serves));
  });

  register('random_recipe', async (a) => {
    const { recipe, matches } = await pickRandomRecipe(
      prisma,
      { vegetarian: a.vegetarian === true, maxMinutes: a.maxMinutes ?? null, exclude: [...new Set(a.exclude ?? [])] },
      rng
    );
    return json({ recipe, matches });
  });

  register('list_contributors', async () => {
    const rows = await listContributors(prisma);
    return json({ contributors: rows.map((c) => ({ name: c.name, recipeCount: c.recipeCount })) });
  });

  register('create_recipe', async (a, ctx) => {
    if (isBlankSource(a.source)) {
      return toolError('source is required: say where this recipe comes from (a cookbook, a site, a person). Blank and "manual" are not accepted.');
    }
    const found = caller ? await findBoundContributor(prisma, caller) : null;
    if (!found) {
      const who = caller?.email ? caller.email : 'This caller';
      return toolError(
        `${who} is not signed in to Commonplace yet. Sign in once at ${publicOrigin}/auth/sso, or ask the owner for an invite.`
      );
    }
    const { contributor, matched } = found;
    ctx.setCaller(contributor.id);
    // The body is built from named arguments only: no contributorId can ride along.
    let body;
    if (a.jsonld !== undefined) {
      const clash = ['title', 'ingredients', 'directions', 'tags', 'prepTime', 'cookTime', 'servings', 'vegetarian'].filter((k) => a[k] !== undefined);
      if (clash.length) return toolError(`Pass either jsonld or ${clash.join(', ')}, not both.`);
      body = bodyFromJsonLd(a.jsonld, a.source);
    } else if (a.title === undefined) {
      return toolError('title is required unless jsonld is given.');
    } else body = {
      title: a.title,
      source: a.source,
      ingredients: a.ingredients,
      directions: a.directions,
      tags: a.tags,
      prepTime: a.prepTime,
      cookTime: a.cookTime,
      servings: a.servings,
      vegetarian: a.vegetarian
    };
    const recipe = await create(prisma, contributor, body);
    log(`mcp.create recipe=${recipe.id} contributor=${contributor.id} matched=${matched}`);
    return json({ id: recipe.id, url: `${publicOrigin}/recipe/${recipe.id}` });
  });

  return server;
}
