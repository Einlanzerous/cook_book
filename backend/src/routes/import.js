import { Router } from 'express';
import { parseHelloFreshUrl } from '../services/helloFreshParser.js';

const router = Router();

// Import recipe from HelloFresh URL
router.post('/hellofresh', async (req, res, next) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!url.includes('hellofresh.com')) {
      return res.status(400).json({ error: 'URL must be from hellofresh.com' });
    }

    const recipeData = await parseHelloFreshUrl(url);

    // Create the recipe in the database
    const recipe = await req.prisma.recipe.create({
      data: {
        title: recipeData.title,
        description: recipeData.description,
        imageUrl: recipeData.imageUrl,
        servings: recipeData.servings,
        prepTime: recipeData.prepTime,
        cookTime: recipeData.cookTime,
        source: 'hellofresh',
        sourceUrl: url,
        ingredients: {
          create: recipeData.ingredients.map(ing => ({
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit
          }))
        },
        directions: {
          create: recipeData.directions.map((instruction, index) => ({
            stepNumber: index + 1,
            instruction
          }))
        },
        tags: {
          connectOrCreate: recipeData.tags.map(tag => ({
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
    if (error.message.includes('Failed to fetch') || error.message.includes('parse')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

export default router;
