import { Router } from 'express';
import { parseHelloFreshUrl } from '../services/helloFreshParser.js';

const router = Router();

/** True for http(s) URLs whose host is hellofresh.com or a subdomain of it. */
export function isHelloFreshUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    return host === 'hellofresh.com' || host.endsWith('.hellofresh.com');
  } catch {
    return false;
  }
}

/**
 * Shape of the preview: the parsed recipe as the create endpoint would store
 * it, plus the source facts the import route fills in. Nothing is saved.
 */
export function presentPreview(recipeData, url) {
  const directions = recipeData.directions.map((d, i) => ({
    stepNumber: i + 1,
    heading: null,
    instruction: typeof d === 'string' ? d : d.instruction
  }));
  return {
    title: recipeData.title,
    description: recipeData.description || null,
    imageUrl: recipeData.imageUrl || null,
    servings: recipeData.servings ?? null,
    prepTime: recipeData.prepTime ?? null,
    cookTime: recipeData.cookTime ?? null,
    totalMinutes: recipeData.totalMinutes ?? null,
    timeSplitEstimated: Boolean(recipeData.timeSplitEstimated),
    category: recipeData.category ?? null,
    cuisine: recipeData.cuisine ?? null,
    vegetarian: Boolean(recipeData.vegetarian),
    source: 'HelloFresh',
    sourceUrl: url,
    ingredients: recipeData.ingredients.map((i) => ({
      amount: i.amount ?? null,
      unit: i.unit ?? null,
      name: i.name
    })),
    directions,
    tags: recipeData.tags
  };
}

// Parse a HelloFresh recipe page WITHOUT saving it (COOK-10). The confirm step
// sends this payload to POST /api/recipes, so what was previewed is what is saved.
router.post('/hellofresh/preview', async (req, res, next) => {
  try {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!isHelloFreshUrl(url)) {
      return res.status(400).json({ error: 'URL must be from hellofresh.com' });
    }
    res.json(presentPreview(await parseHelloFreshUrl(url), url));
  } catch (error) {
    if (error.message?.includes('Failed to fetch') || error.message?.includes('parse')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

export default router;
