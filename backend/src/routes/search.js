import { Router } from 'express';
import { searchRecipes } from '../services/recipes.js';
import { HttpError } from '../services/recipeWrite.js';

const router = Router();

const truthy = (v) => ['1', 'true', 'yes'].includes(String(v ?? '').toLowerCase());

// GET /api/search?q=&ingredient=&tag=&contributor=<id>&maxMinutes=&vegetarian=
// Every parameter is optional; the response is the same recipe array as before.
router.get('/', async (req, res, next) => {
  try {
    // String caps (q, ingredient, tag, contributor) are enforced in searchRecipes.
    const { q, ingredient, tag, contributor: contributorId } = req.query;

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
