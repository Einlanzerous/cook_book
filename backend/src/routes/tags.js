import { Router } from 'express';
import { boundedString, MAX_LIST_RESULTS, MAX_TAG_LENGTH } from '../middleware/readLimits.js';
import { recipeInclude, presentRecipe } from '../services/recipeShape.js';

const router = Router();

// List all tags with recipe counts
router.get('/', async (req, res, next) => {
  try {
    // Tags with no recipes are omitted: legacy Tag rows are orphaned once the
    // old recipes are re-imported (cleanup is COOK-26) and must not show as 0.
    const tags = await req.prisma.tag.findMany({
      where: { recipes: { some: {} } },
      include: {
        _count: {
          select: { recipes: true }
        }
      },
      orderBy: {
        recipes: {
          _count: 'desc'
        }
      }
    });

    const tagsWithCount = tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      recipeCount: tag._count.recipes
    }));

    res.json(tagsWithCount);
  } catch (error) {
    next(error);
  }
});

// Get recipes by tag name
router.get('/:name/recipes', async (req, res, next) => {
  try {
    const name = boundedString(req.params.name, 'name', MAX_TAG_LENGTH);
    const tag = await req.prisma.tag.findUnique({
      where: { name },
      include: {
        recipes: {
          include: recipeInclude,
          orderBy: { updatedAt: 'desc' },
          take: MAX_LIST_RESULTS
        }
      }
    });

    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.json(tag.recipes.map(presentRecipe));
  } catch (error) {
    next(error);
  }
});

export default router;
