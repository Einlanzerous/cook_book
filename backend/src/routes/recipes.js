import { Router } from 'express';
import { recipeInclude, presentRecipe } from '../services/recipeShape.js';
import {
  HttpError,
  normalizeSource,
  processTags,
  tagConnect,
  prepareDirections,
  prepareIngredients,
  scalarData,
  resolveContributorId
} from '../services/recipeWrite.js';

const router = Router();

// List all recipes with optional tag filter. Default order is updatedAt;
// ?sort=createdAt gives "Recently added".
router.get('/', async (req, res, next) => {
  try {
    const { tag, sort } = req.query;

    const where = tag ? {
      tags: { some: { name: { equals: tag, mode: 'insensitive' } } }
    } : {};

    const recipes = await req.prisma.recipe.findMany({
      where,
      include: recipeInclude,
      orderBy: sort === 'createdAt' ? { createdAt: 'desc' } : { updatedAt: 'desc' }
    });

    res.json(recipes.map(presentRecipe));
  } catch (error) {
    next(error);
  }
});

// Get single recipe
router.get('/:id', async (req, res, next) => {
  try {
    const recipe = await req.prisma.recipe.findUnique({
      where: { id: req.params.id },
      include: recipeInclude
    });

    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    res.json(presentRecipe(recipe));
  } catch (error) {
    next(error);
  }
});

// Create recipe
router.post('/', async (req, res, next) => {
  try {
    const body = req.body;
    const tags = processTags(body.tags);
    const contributorId = await resolveContributorId(req.prisma, body.contributorId);

    const recipe = await req.prisma.recipe.create({
      data: {
        ...scalarData(body),
        source: normalizeSource(body.source),
        contributorId,
        ingredients: { create: prepareIngredients(body.ingredients || []) },
        directions: { create: prepareDirections(body.directions || []) },
        tags: { connectOrCreate: tagConnect(tags || []) }
      },
      include: recipeInclude
    });

    res.status(201).json(presentRecipe(recipe));
  } catch (error) {
    next(error);
  }
});

// Update recipe: a partial update in one transaction. Omitted fields are
// unchanged; ingredients, directions and tags are replaced only when supplied.
router.put('/:id', async (req, res, next) => {
  try {
    const body = req.body;
    const tags = processTags(body.tags);

    const recipe = await req.prisma.$transaction(async (tx) => {
      const existing = await tx.recipe.findUnique({
        where: { id: req.params.id },
        include: { directions: true }
      });
      if (!existing) throw new HttpError(404, 'Recipe not found');

      const data = scalarData(body, existing);
      if (body.source !== undefined) data.source = normalizeSource(body.source);
      if (body.contributorId !== undefined) {
        if (body.contributorId === null) throw new HttpError(400, 'contributorId cannot be cleared');
        data.contributorId = await resolveContributorId(tx, body.contributorId);
      }

      if (body.ingredients !== undefined) {
        await tx.ingredient.deleteMany({ where: { recipeId: existing.id } });
        data.ingredients = { create: prepareIngredients(body.ingredients) };
      }
      if (body.directions !== undefined) {
        await tx.direction.deleteMany({ where: { recipeId: existing.id } });
        data.directions = { create: prepareDirections(body.directions, existing.directions) };
      }
      if (tags !== undefined) {
        data.tags = { set: [], connectOrCreate: tagConnect(tags) };
      }

      return tx.recipe.update({
        where: { id: existing.id },
        data,
        include: recipeInclude
      });
    });

    res.json(presentRecipe(recipe));
  } catch (error) {
    next(error);
  }
});

// Delete recipe
router.delete('/:id', async (req, res, next) => {
  try {
    await req.prisma.recipe.delete({
      where: { id: req.params.id }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
