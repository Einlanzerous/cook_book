import { Router } from 'express';

const router = Router();

// List all tags with recipe counts
router.get('/', async (req, res, next) => {
  try {
    const tags = await req.prisma.tag.findMany({
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
    const tag = await req.prisma.tag.findUnique({
      where: { name: req.params.name },
      include: {
        recipes: {
          include: {
            ingredients: true,
            directions: { orderBy: { stepNumber: 'asc' } },
            tags: true
          }
        }
      }
    });

    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.json(tag.recipes);
  } catch (error) {
    next(error);
  }
});

export default router;
