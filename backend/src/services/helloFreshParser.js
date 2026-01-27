import axios from 'axios';
import * as cheerio from 'cheerio';

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

  const directions = [];
  if (data.recipeInstructions) {
    data.recipeInstructions.forEach(instruction => {
      if (typeof instruction === 'string') {
        directions.push(instruction);
      } else if (instruction.text) {
        directions.push(instruction.text);
      }
    });
  }

  // Extract times - HelloFresh often only provides totalTime
  let prepTime = null;
  let cookTime = null;
  let totalTime = null;

  if (data.prepTime) {
    prepTime = parseDuration(data.prepTime);
  }
  if (data.cookTime) {
    cookTime = parseDuration(data.cookTime);
  }
  if (data.totalTime) {
    totalTime = parseDuration(data.totalTime);
    // If we only have totalTime, estimate prep as 1/3 and cook as 2/3
    if (!prepTime && !cookTime && totalTime) {
      prepTime = Math.round(totalTime / 3);
      cookTime = totalTime - prepTime;
    }
  }

  // Calculate total time for tag generation
  const calculatedTotalTime = totalTime || (prepTime || 0) + (cookTime || 0);

  // Generate tags based on content
  const tags = generateTags(data.name, ingredients, data.recipeCuisine, data.recipeCategory, calculatedTotalTime);

  return {
    title: data.name || 'Imported Recipe',
    description: data.description || '',
    imageUrl: Array.isArray(data.image) ? data.image[0] : data.image,
    servings: parseInt(data.recipeYield) || 2,
    prepTime,
    cookTime,
    ingredients,
    directions,
    tags
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

  const directions = [];
  $('[data-test-id="instruction-step"], .instructions-list li, [class*="instruction"] p').each((i, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10) {
      directions.push(text);
    }
  });

  const tags = generateTags(title, ingredients, null, null, null);

  return {
    title,
    description,
    imageUrl,
    servings: 2,
    prepTime: null,
    cookTime: null,
    ingredients,
    directions,
    tags
  };
}

// Normalize Unicode fractions to ASCII
function normalizeFractions(str) {
  if (!str) return str;
  return str
    .replace(/¼/g, '1/4')
    .replace(/½/g, '1/2')
    .replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3')
    .replace(/⅛/g, '1/8')
    .replace(/⅜/g, '3/8')
    .replace(/⅝/g, '5/8')
    .replace(/⅞/g, '7/8')
    .replace(/⅕/g, '1/5')
    .replace(/⅖/g, '2/5')
    .replace(/⅗/g, '3/5')
    .replace(/⅘/g, '4/5')
    .replace(/⅙/g, '1/6')
    .replace(/⅚/g, '5/6');
}

function parseIngredientString(str) {
  // Normalize Unicode fractions first
  const normalized = normalizeFractions(str);

  // Match: optional amount (including fractions), optional unit, then name
  // Amount can be: "1", "1.5", "1/2", "1 1/2"
  const match = normalized.match(/^([\d./\s]+?)?\s*(oz|ounce|ounces|lb|lbs|pound|pounds|cup|cups|tbsp|tsp|tablespoon|tablespoons|teaspoon|teaspoons|g|kg|ml|l|piece|pieces|clove|cloves|unit|units)?\s*(.+)$/i);

  if (match) {
    let amount = match[1]?.trim() || null;

    // Clean up amount - remove extra spaces around slashes
    if (amount) {
      amount = amount.replace(/\s*\/\s*/g, '/').trim();
    }

    return {
      amount: amount,
      unit: match[2] || null,
      name: match[3]?.trim() || str
    };
  }

  return {
    amount: null,
    unit: null,
    name: str
  };
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

// Get time-based tag
function getTimeTag(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return null;
  if (totalMinutes <= 15) return '15 Minutes';
  if (totalMinutes <= 30) return '30 Minutes';
  if (totalMinutes <= 45) return '45 Minutes';
  if (totalMinutes <= 60) return '1 Hour';
  return '1 Hour+';
}

function generateTags(title, ingredients, cuisine, category, totalTime = null) {
  const tags = new Set();
  const titleLower = (title || '').toLowerCase();
  const ingredientNames = ingredients.map(i => i.name.toLowerCase()).join(' ');

  // Time-based tag
  const timeTag = getTimeTag(totalTime);
  if (timeTag) {
    tags.add(timeTag);
  }

  // Cuisine tags
  if (cuisine) {
    tags.add(toTitleCase(cuisine));
  }

  // Category tags
  if (category) {
    if (Array.isArray(category)) {
      category.forEach(c => tags.add(toTitleCase(c)));
    } else {
      tags.add(toTitleCase(category));
    }
  }

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

  // Style detection
  if (titleLower.includes('vegetarian') || titleLower.includes('veggie')) {
    tags.add('Vegetarian');
  }
  if (titleLower.includes('bowl')) {
    tags.add('Bowl');
  }
  if (titleLower.includes('salad')) {
    tags.add('Salad');
  }
  if (titleLower.includes('pasta') || titleLower.includes('spaghetti')) {
    tags.add('Pasta');
  }
  if (titleLower.includes('taco') || titleLower.includes('burrito')) {
    tags.add('Mexican');
  }
  if (titleLower.includes('stir fry') || titleLower.includes('teriyaki') || titleLower.includes('asian')) {
    tags.add('Asian');
  }

  return Array.from(tags).slice(0, 6); // Limit to 6 tags (increased to accommodate time tag)
}
