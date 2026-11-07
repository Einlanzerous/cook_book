import { Router } from 'express';
import { MAX_EXCLUDE, pickRandomRecipe } from '../services/randomRecipe.js';
import { HttpError } from '../services/recipeWrite.js';

const router = Router();

const truthy = (v) => ['1', 'true', 'yes'].includes(String(v ?? '').toLowerCase());

// GET /api/recipes/random?vegetarian=1&maxMinutes=30&exclude=<id>,<id>
// 200 { recipe, matches }; recipe is null when nothing matches the filters.
router.get('/', async (req, res, next) => {
  try {
    const { vegetarian, maxMinutes, exclude } = req.query;

    let max = null;
    if (maxMinutes !== undefined && maxMinutes !== '') {
      if (!/^\d+$/.test(String(maxMinutes)) || Number(maxMinutes) < 1 || Number(maxMinutes) > 100000) {
        throw new HttpError(400, 'maxMinutes must be a positive whole number');
      }
      max = Number(maxMinutes);
    }

    const ids = [...new Set([].concat(exclude ?? []).flatMap((s) => String(s).split(',')).map((s) => s.trim()).filter(Boolean))];
    if (ids.length > MAX_EXCLUDE) {
      throw new HttpError(400, `exclude takes at most ${MAX_EXCLUDE} ids`);
    }

    res.json(await pickRandomRecipe(req.prisma, { vegetarian: truthy(vegetarian), maxMinutes: max, exclude: ids }));
  } catch (error) {
    next(error);
  }
});

export default router;
