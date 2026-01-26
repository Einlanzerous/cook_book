import { Router } from 'express';

const router = Router();

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

// Normalize and augment tags
function processTags(tags, prepTime, cookTime) {
  const normalizedTags = (tags || []).map(tag => toTitleCase(tag.trim()));

  // Add time-based tag if not already present
  const totalTime = (prepTime || 0) + (cookTime || 0);
  const timeTag = getTimeTag(totalTime);
  if (timeTag && !normalizedTags.includes(timeTag)) {
    normalizedTags.unshift(timeTag);
  }

  // Remove duplicates
  return [...new Set(normalizedTags)];
}

// List all recipes with optional tag filter
router.get('/', async (req, res, next) => {
  try {
    const { tag } = req.query;

    const where = tag ? {
      tags: { some: { name: { equals: tag, mode: 'insensitive' } } }
    } : {};

    const recipes = await req.prisma.recipe.findMany({
      where,
      include: {
        ingredients: true,
        directions: { orderBy: { stepNumber: 'asc' } },
        tags: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.json(recipes);
  } catch (error) {
    next(error);
  }
});

// Get single recipe
router.get('/:id', async (req, res, next) => {
  try {
    const recipe = await req.prisma.recipe.findUnique({
      where: { id: req.params.id },
      include: {
        ingredients: true,
        directions: { orderBy: { stepNumber: 'asc' } },
        tags: true
      }
    });

    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    res.json(recipe);
  } catch (error) {
    next(error);
  }
});

// Create recipe
router.post('/', async (req, res, next) => {
  try {
    const { title, description, imageUrl, servings, prepTime, cookTime, source, sourceUrl, ingredients, directions, tags } = req.body;

    // Process tags: normalize casing and add time tag
    const processedTags = processTags(tags, prepTime, cookTime);

    const recipe = await req.prisma.recipe.create({
      data: {
        title,
        description,
        imageUrl,
        servings,
        prepTime,
        cookTime,
        source: source || 'manual',
        sourceUrl,
        ingredients: {
          create: ingredients?.map(ing => ({
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit
          })) || []
        },
        directions: {
          create: directions?.map((dir, index) => ({
            stepNumber: index + 1,
            instruction: typeof dir === 'string' ? dir : dir.instruction
          })) || []
        },
        tags: {
          connectOrCreate: processedTags.map(tag => ({
            where: { name: tag },
            create: { name: tag }
          }))
        }
      },
      include: {
        ingredients: true,
        directions: { orderBy: { stepNumber: 'asc' } },
        tags: true
      }
    });

    res.status(201).json(recipe);
  } catch (error) {
    next(error);
  }
});

// Update recipe
router.put('/:id', async (req, res, next) => {
  try {
    const { title, description, imageUrl, servings, prepTime, cookTime, source, sourceUrl, ingredients, directions, tags } = req.body;

    // Process tags: normalize casing and add time tag
    const processedTags = processTags(tags, prepTime, cookTime);

    // Delete existing ingredients and directions
    await req.prisma.ingredient.deleteMany({ where: { recipeId: req.params.id } });
    await req.prisma.direction.deleteMany({ where: { recipeId: req.params.id } });

    const recipe = await req.prisma.recipe.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        imageUrl,
        servings,
        prepTime,
        cookTime,
        source,
        sourceUrl,
        ingredients: {
          create: ingredients?.map(ing => ({
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit
          })) || []
        },
        directions: {
          create: directions?.map((dir, index) => ({
            stepNumber: index + 1,
            instruction: typeof dir === 'string' ? dir : dir.instruction
          })) || []
        },
        tags: {
          set: [],
          connectOrCreate: processedTags.map(tag => ({
            where: { name: tag },
            create: { name: tag }
          }))
        }
      },
      include: {
        ingredients: true,
        directions: { orderBy: { stepNumber: 'asc' } },
        tags: true
      }
    });

    res.json(recipe);
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
