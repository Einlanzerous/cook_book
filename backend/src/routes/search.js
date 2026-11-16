import { Router } from 'express';
import { searchRecipes } from '../services/recipes.js';
import { HttpError } from '../services/recipeWrite.js';
import { boundedString, MAX_QUERY_LENGTH, MAX_TAG_LENGTH, MAX_ID_LENGTH } from '../middleware/readLimits.js';

const router = Router();

const truthy = (v) => ['1', 'true', 'yes'].includes(String(v ?? '').toLowerCase());

// GET /api/search?q=&ingredient=&tag=&contributor=<id>&maxMinutes=&vegetarian=
// Every parameter is optional; the response is the same recipe array as before.
router.get('/', async (req, res, next) => {
  try {
    const q = boundedString(req.query.q, 'q', MAX_QUERY_LENGTH);
    const ingredient = boundedString(req.query.ingredient, 'ingredient', MAX_QUERY_LENGTH);
    const tag = boundedString(req.query.tag, 'tag', MAX_TAG_LENGTH);
    const contributorId = boundedString(req.query.contributor, 'contributor', MAX_ID_LENGTH);

    let maxMinutes;
    const m = req.query.maxMinutes;
    if (m !== undefined && m !== '') {
      if (!/^\d+$/.test(m) || Number(m) < 1 || Number(m) > 100000) {
        throw new HttpError(400, 'maxMinutes must be a positive whole number');
      }
      maxMinutes = Number(m);
    }

    res.json(await searchRecipes(req.prisma, {
      q,
      ingredient,
      tag,
      contributorId: contributorId || undefined,
      maxMinutes,
      vegetarian: truthy(req.query.vegetarian)
    }));
  } catch (error) {
    next(error);
  }
});

export default router;
