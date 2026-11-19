/**
 * schema.org/Recipe JSON-LD to a create body (COOK-14). Pure: no Prisma, no
 * network. The result is the same body shape POST /api/recipes takes, and it
 * goes through createRecipe like any other, so every write cap and the
 * attribution rule apply unchanged; there is no second data path.
 *
 * Mapping choices that are deliberately conservative:
 *  - `author` is not read, and `url` becomes sourceUrl only. The required
 *    `source` label always comes from the caller, never from the document.
 *  - only a total time (no prep/cook) is stored as the total; the 1/3-2/3
 *    split the HelloFresh importer guesses at is not invented here.
 *  - an ingredient string the parser cannot split is stored whole as the name.
 *  - tags from keywords are dropped past the tag caps rather than refusing the
 *    whole recipe; every other cap refuses (see assertWithinLimits).
 */
import { HttpError } from './recipeWrite.js';
import { LIMITS } from './recipes.js';
import { parseIngredientString, cleanDirection } from './helloFreshParser.js';

const MAX_MINUTES = 100000;
const MAX_SERVES = 1000;
const MAX_URL = 2000;
const MAX_DEPTH = 6;
const MAX_NODES = 5000;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const str = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const hasType = (node, type) => asList(node?.['@type']).some((t) => typeof t === 'string' && t.replace(/^.*[/#]/, '') === type);

/** The one Recipe node in a JSON-LD document: a bare object, an array, or an @graph. */
export function findRecipeNode(input) {
  let doc = input;
  if (typeof doc === 'string') {
    try {
      doc = JSON.parse(doc);
    } catch {
      throw new HttpError(400, 'jsonld is not valid JSON');
    }
  }
  const found = [];
  let seen = 0;
  const walk = (node, depth) => {
    if (depth > MAX_DEPTH || seen++ > MAX_NODES) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    if (!isObject(node)) return;
    if (hasType(node, 'Recipe')) return void found.push(node);
    if (node['@graph'] !== undefined) walk(node['@graph'], depth + 1);
  };
  walk(doc, 0);
  if (found.length === 0) throw new HttpError(400, 'jsonld has no schema.org/Recipe object');
  if (found.length > 1) throw new HttpError(400, 'jsonld holds more than one Recipe; send one recipe at a time');
  return found[0];
}

/** ISO 8601 duration (PT1H15M, P1DT2H, PT90S) to whole minutes, or null. */
export function parseIsoDuration(value) {
  const m = String(value ?? '')
    .trim()
    .match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m || m.slice(1).every((x) => x === undefined)) return null;
  const [d, h, min, s] = m.slice(1).map((x) => Number(x ?? 0));
  const minutes = Math.round(d * 1440 + h * 60 + min + s / 60);
  return minutes >= 0 && minutes <= MAX_MINUTES ? minutes : null;
}

function servingsOf(value) {
  for (const v of asList(value)) {
    const n = typeof v === 'number' ? Math.trunc(v) : Number((String(v).match(/\d+/) ?? [])[0]);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_SERVES) return n;
  }
  return undefined;
}

function httpUrl(value) {
  const raw = str(isObject(value) ? (value.url ?? value.contentUrl) : value);
  if (!raw || raw.length > MAX_URL) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? raw : undefined;
  } catch {
    return undefined;
  }
}

const firstUrl = (value) => asList(value).map(httpUrl).find(Boolean);

/** A comma string or an array of strings, flattened to trimmed non-empty names. */
function names(value) {
  return asList(value)
    .flatMap((v) => (typeof v === 'string' ? v.split(',') : isObject(v) ? [str(v.name)] : []))
    .map((s) => s.trim())
    .filter(Boolean);
}

function directionsOf(value) {
  const out = [];
  const push = (text, heading) => {
    cleanDirection(text).forEach((instruction, i) => out.push({ instruction, heading: i === 0 && heading ? heading : null }));
  };
  const walk = (node, heading, depth) => {
    if (depth > MAX_DEPTH) return;
    if (typeof node === 'string') return push(node, heading);
    if (!isObject(node)) return;
    if (node.itemListElement !== undefined) {
      // A section: its name heads the first step that has text.
      let pending = str(node.name) || heading;
      for (const child of asList(node.itemListElement)) {
        const before = out.length;
        walk(child, pending, depth + 1);
        if (out.length > before) pending = null;
      }
      return;
    }
    push(str(node.text) || str(node.name), heading);
  };
  asList(value).forEach((n) => walk(n, null, 0));
  return out;
}

/**
 * @param {object|array|string} input  JSON-LD (parsed, or the JSON text)
 * @returns a body for createRecipe, minus `source` (the caller supplies it)
 */
export function jsonLdToRecipeBody(input) {
  const node = findRecipeNode(input);
  const body = {};

  const title = str(node.name) || str(node.headline);
  if (title) body.title = title;
  const description = str(node.description);
  if (description) body.description = description;
  const imageUrl = firstUrl(node.image);
  if (imageUrl) body.imageUrl = imageUrl;
  const sourceUrl = httpUrl(node.url);
  if (sourceUrl) body.sourceUrl = sourceUrl;

  const servings = servingsOf(node.recipeYield);
  if (servings !== undefined) body.servings = servings;

  const prep = parseIsoDuration(node.prepTime);
  const cook = parseIsoDuration(node.cookTime);
  const total = parseIsoDuration(node.totalTime);
  if (prep !== null) body.prepTime = prep;
  if (cook !== null) body.cookTime = cook;
  if (total !== null) body.totalMinutes = total;

  body.ingredients = asList(node.recipeIngredient).map(str).filter(Boolean).map(parseIngredientString);
  body.directions = directionsOf(node.recipeInstructions);

  const category = names(node.recipeCategory)[0];
  if (category) body.category = category;
  const cuisine = names(node.recipeCuisine)[0];
  if (cuisine) body.cuisine = cuisine;

  const seen = new Set();
  body.tags = names(node.keywords)
    .filter((t) => t.length <= LIMITS.tagLength)
    .filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .slice(0, LIMITS.tags);

  if (asList(node.suitableForDiet).some((d) => /(^|[/#])VegetarianDiet$/.test(str(isObject(d) ? d['@id'] : d)))) {
    body.vegetarian = true;
  }

  return body;
}

/**
 * A create body from a JSON-LD document plus the caller's `source`. A missing
 * Recipe name is a 400 here, so the message names the JSON-LD, not the DB.
 */
export function bodyFromJsonLd(jsonld, source) {
  const body = jsonLdToRecipeBody(jsonld);
  if (!body.title) throw new HttpError(400, 'the Recipe in jsonld has no name');
  return { ...body, source };
}
