import axios from 'axios';
import * as cheerio from 'cheerio';
import { normalizeAmount } from './quantity.js';

export async function parseHelloFreshUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);

    // Try to find JSON-LD structured data first
    let recipeData = null;
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const json = JSON.parse($(el).html());
        if (json['@type'] === 'Recipe' || (Array.isArray(json['@graph']) && json['@graph'].find(item => item['@type'] === 'Recipe'))) {
          recipeData = json['@type'] === 'Recipe' ? json : json['@graph'].find(item => item['@type'] === 'Recipe');
        }
      } catch (e) {
        // Continue to next script tag
      }
    });

    if (recipeData) {
      return parseJsonLd(recipeData);
    }

    // Fallback to HTML parsing
    return parseHtml($);
  } catch (error) {
    throw new Error(`Failed to fetch recipe: ${error.message}`);
  }
}

function parseJsonLd(data) {
  const ingredients = [];

  if (data.recipeIngredient) {
    data.recipeIngredient.forEach(ing => {
      const parsed = parseIngredientString(ing);
      ingredients.push(parsed);
    });
  }

  const rawDirections = [];
  if (data.recipeInstructions) {
    data.recipeInstructions.forEach(instruction => {
      if (typeof instruction === 'string') {
        rawDirections.push(instruction);
      } else if (instruction.text) {
        rawDirections.push(instruction.text);
      }
    });
  }
  const directions = cleanDirections(rawDirections);

  // Extract times - HelloFresh often only provides totalTime
  let prepTime = null;
  let cookTime = null;
  let totalTime = null;
  let timeSplitEstimated = false;

  if (data.prepTime) {
    prepTime = parseDuration(data.prepTime);
  }
  if (data.cookTime) {
    cookTime = parseDuration(data.cookTime);
  }
  if (data.totalTime) {
    totalTime = parseDuration(data.totalTime);
    // If we only have totalTime, estimate prep as 1/3 and cook as 2/3. The split
    // is a guess, so it is flagged (timeSplitEstimated) for consumers.
    if (!prepTime && !cookTime && totalTime) {
      prepTime = Math.round(totalTime / 3);
      cookTime = totalTime - prepTime;
      timeSplitEstimated = true;
    }
  }

  // Stored total: the page's own total when given, else prep + cook.
  const totalMinutes = totalTime || (prepTime || 0) + (cookTime || 0) || null;

  // Category and cuisine are columns, not tags (COOK-6).
  const category = firstText(data.recipeCategory);
  let cuisine = firstText(data.recipeCuisine);

  const detected = detectTags(data.name, ingredients);
  if (!cuisine) cuisine = detected.cuisine;

  return {
    title: data.name || 'Imported Recipe',
    description: data.description || '',
    imageUrl: Array.isArray(data.image) ? data.image[0] : data.image,
    servings: parseInt(data.recipeYield) || 2,
    prepTime,
    cookTime,
    totalMinutes,
    timeSplitEstimated,
    category,
    cuisine,
    vegetarian: detected.vegetarian,
    ingredients,
    directions,
    tags: detected.tags
  };
}

function parseHtml($) {
  // Fallback HTML parsing for HelloFresh
  const title = $('h1').first().text().trim() || 'Imported Recipe';
  const description = $('meta[name="description"]').attr('content') || '';
  const imageUrl = $('meta[property="og:image"]').attr('content') || '';

  const ingredients = [];
  $('[data-test-id="ingredient-item-shipped"], .ingredients-list li, [class*="ingredient"]').each((i, el) => {
    const text = $(el).text().trim();
    if (text) {
      ingredients.push(parseIngredientString(text));
    }
  });

  const rawDirections = [];
  $('[data-test-id="instruction-step"], .instructions-list li, [class*="instruction"] p').each((i, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10) {
      rawDirections.push(text);
    }
  });
  const directions = cleanDirections(rawDirections);

  const detected = detectTags(title, ingredients);

  return {
    title,
    description,
    imageUrl,
    servings: 2,
    prepTime: null,
    cookTime: null,
    totalMinutes: null,
    timeSplitEstimated: false,
    category: null,
    cuisine: detected.cuisine,
    vegetarian: detected.vegetarian,
    ingredients,
    directions,
    tags: detected.tags
  };
}

// ---------------------------------------------------------------------------
// Ingredient strings (COOK-27). The whole leading quantity token is read first
// (integer, decimal, ASCII or Unicode fraction, mixed number, range), then the
// unit, then the name. The old parser captured only [\d./\s] and split on the
// first other character, so "1/2 cup X" became amount "1" + name "/2 cup X".
// Unicode fractions are normalised by quantity.js, which also turns '1½' into
// '1 1/2' (not '11/2').
// ---------------------------------------------------------------------------

const NUM = String.raw`(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+(?:\.\d+)?|\.\d+)`;
const QUANTITY_RE = new RegExp(String.raw`^(${NUM}(?:\s*(?:-|–|—|to)\s*${NUM})?)(?![\d./])`, 'i');

// Real units, kept as written (lower-cased).
const UNITS = [
  'ounces', 'ounce', 'oz', 'pounds', 'pound', 'lbs', 'lb', 'cups', 'cup',
  'tablespoons', 'tablespoon', 'tbsp', 'teaspoons', 'teaspoon', 'tsp',
  'grams', 'gram', 'kg', 'g', 'ml', 'l', 'liters', 'liter', 'quarts', 'quart', 'pints', 'pint',
  'pieces', 'piece', 'cloves', 'clove', 'cans', 'can', 'packages', 'package', 'bunches', 'bunch',
  'slices', 'slice', 'sprigs', 'sprig', 'stalks', 'stalk', 'heads', 'head',
  'pinches', 'pinch', 'dashes', 'dash', 'thumbs', 'thumb'
];
const UNIT_RE = new RegExp(`^(${UNITS.join('|')})(?=\\s|$)\\.?\\s*`, 'i');
// HelloFresh's placeholder for "a count of the thing itself": no unit.
const PLACEHOLDER_UNIT_RE = /^(units?)(?=\s|$)\s*/i;
// "(tsp) Cumin": an abbreviation that belongs to the unit, not the name.
const PAREN_UNIT_RE = /^\(\s*(tsp|tbsp|oz|lb|lbs|g|kg|ml|l)\s*\)\s*/i;
const PAREN_UNIT_FULL = {
  tsp: 'teaspoon', tbsp: 'tablespoon', oz: 'ounce', lb: 'pound', lbs: 'pound',
  g: 'gram', kg: 'kg', ml: 'ml', l: 'l'
};

export function parseIngredientString(str) {
  const raw = String(str ?? '').replace(/\s+/g, ' ').trim();
  let rest = normalizeAmount(raw);
  let amount = null;
  let unit = null;

  const q = rest.match(QUANTITY_RE);
  if (q) {
    amount = q[1].replace(/\s*\/\s*/g, '/').replace(/\s*(-|–|—)\s*/g, '-').replace(/\s+/g, ' ').trim();
    rest = rest.slice(q[0].length).trim();
  }

  let m;
  if (amount !== null && (m = rest.match(PLACEHOLDER_UNIT_RE))) {
    rest = rest.slice(m[0].length);
  } else if (amount !== null && (m = rest.match(UNIT_RE))) {
    unit = m[1].toLowerCase();
    rest = rest.slice(m[0].length);
  } else if (!amount && (m = rest.match(/^(teaspoons?|tablespoons?|ounces?|pounds?)\s+(?=\()/i))) {
    // "teaspoon (tsp) Cumin": unit with no amount
    unit = m[1].toLowerCase();
    rest = rest.slice(m[0].length);
  }

  if ((m = rest.match(PAREN_UNIT_RE))) {
    if (!unit) unit = PAREN_UNIT_FULL[m[1].toLowerCase()];
    rest = rest.slice(m[0].length);
  }

  rest = rest.trim();
  if (!rest) {
    // Nothing left for a name: the unit word was the name (or the line is blank).
    if (unit && amount !== null) return { amount, unit: null, name: unit };
    return { amount: null, unit: null, name: raw };
  }
  return { amount, unit, name: rest };
}

/**
 * One direction string to clean steps. Strips the leading "• " bullet and
 * rejoins lines the card hard-wrapped, while keeping real boundaries: blank
 * lines, a bullet at the start of a line and "1." style numbering each start a
 * new step.
 */
export function cleanDirection(text) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n');
  return normalized
    .split(/\n[ \t]*\n|\n[ \t]*[•●▪‣][ \t]*|\n[ \t]*\d{1,2}[.)][ \t]+/)
    .map((part) => part.replace(/^[\s•●▪‣]+/, '').replace(/^\d{1,2}[.)]\s+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function cleanDirections(list) {
  return list.flatMap(cleanDirection);
}

function parseDuration(iso8601) {
  // Parse ISO 8601 duration (PT30M, PT1H30M, etc.)
  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (match) {
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    return hours * 60 + minutes;
  }
  return null;
}

// Convert string to Title Case
function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** First non-empty string of a schema.org string-or-array field, Title-Cased. */
function firstText(value) {
  const first = Array.isArray(value) ? value.find((v) => typeof v === 'string' && v.trim()) : value;
  return typeof first === 'string' && first.trim() ? toTitleCase(first.trim()) : null;
}

/**
 * Tags from the title and ingredients, plus the facts that are columns.
 * Time-bucket, cuisine, category and 'Vegetarian' tags are no longer emitted
 * (COOK-6): total time, category, cuisine and vegetarian are columns. Protein
 * and dish-type tags stay. The old 'Mexican' / 'Asian' style tags are cuisines,
 * so they come back as `cuisine`, not as tags.
 */
function detectTags(title, ingredients) {
  const tags = new Set();
  const titleLower = (title || '').toLowerCase();
  const ingredientNames = ingredients.map(i => i.name.toLowerCase()).join(' ');
  let cuisine = null;

  // Protein detection
  if (titleLower.includes('chicken') || ingredientNames.includes('chicken')) {
    tags.add('Chicken');
  }
  if (titleLower.includes('beef') || ingredientNames.includes('beef') || ingredientNames.includes('steak')) {
    tags.add('Beef');
  }
  if (titleLower.includes('pork') || ingredientNames.includes('pork')) {
    tags.add('Pork');
  }
  if (titleLower.includes('shrimp') || titleLower.includes('salmon') || titleLower.includes('fish') ||
      ingredientNames.includes('shrimp') || ingredientNames.includes('salmon') || ingredientNames.includes('fish')) {
    tags.add('Seafood');
  }

  // Dish-type detection
  if (titleLower.includes('bowl')) {
    tags.add('Bowl');
  }
  if (titleLower.includes('salad')) {
    tags.add('Salad');
  }
  if (titleLower.includes('pasta') || titleLower.includes('spaghetti')) {
    tags.add('Pasta');
  }

  // Style detection that is really cuisine
  if (titleLower.includes('taco') || titleLower.includes('burrito')) {
    cuisine = 'Mexican';
  }
  if (titleLower.includes('stir fry') || titleLower.includes('teriyaki') || titleLower.includes('asian')) {
    cuisine = cuisine || 'Asian';
  }

  const vegetarian = titleLower.includes('vegetarian') || titleLower.includes('veggie');

  return { tags: Array.from(tags), cuisine, vegetarian };
}
