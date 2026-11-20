import { Router } from 'express';
import { createRecipe } from '../services/recipes.js';
import { bodyFromJsonLd } from '../services/recipeJsonLd.js';
import { HttpError, isBlankSource } from '../services/recipeWrite.js';

const router = Router();

// File a recipe from schema.org/Recipe JSON-LD (COOK-14). Body: { jsonld, source }.
// Behind the write guard like every /api write; attribution is the signed-in
// caller, and the mapped body goes through the same createRecipe as POST /api/recipes.
router.post('/jsonld', async (req, res, next) => {
  try {
    const { jsonld, source } = req.body ?? {};
    if (jsonld === undefined || jsonld === null) throw new HttpError(400, 'jsonld is required');
    if (typeof source !== 'string' || isBlankSource(source)) {
      throw new HttpError(400, 'source is required: say where this recipe comes from. Blank and "manual" are not accepted.');
    }
    res.status(201).json(await createRecipe(req.prisma, req.contributor, bodyFromJsonLd(jsonld, source)));
  } catch (error) {
    next(error);
  }
});

export default router;
