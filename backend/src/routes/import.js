import { Router } from 'express';
import { parseHelloFreshUrl, ImportError } from '../services/helloFreshParser.js';
import { isHelloFreshUrl } from '../services/helloFreshUrl.js';
import { recipeInclude, presentRecipe } from '../services/recipeShape.js';
import { prepareIngredients, prepareDirections, tagConnect } from '../services/recipeWrite.js';

const router = Router();

// Import recipe from HelloFresh URL
router.post('/hellofresh', async (req, res, next) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (typeof url !== 'string' || !isHelloFreshUrl(url)) {
      return res.status(400).json({ error: 'URL must be from hellofresh.com' });
    }

    const recipeData = await parseHelloFreshUrl(url);


    // Create the recipe in the database. The canonical stored value is
    // 'HelloFresh' (ruling 15); legacy 'hellofresh' rows are read
    // case-insensitively.
    const recipe = await req.prisma.recipe.create({
      data: {
        title: recipeData.title,
        description: recipeData.description,
        imageUrl: recipeData.imageUrl,
        servings: recipeData.servings,
        prepTime: recipeData.prepTime,
        cookTime: recipeData.cookTime,
        totalMinutes: recipeData.totalMinutes,
        timeSplitEstimated: recipeData.timeSplitEstimated,
        category: recipeData.category,
        cuisine: recipeData.cuisine,
        vegetarian: recipeData.vegetarian,
        source: 'HelloFresh',
        sourceUrl: url,
        contributorId: req.contributor.id, // the signed-in caller
        ingredients: { create: prepareIngredients(recipeData.ingredients) },
        directions: { create: prepareDirections(recipeData.directions) },
        tags: { connectOrCreate: tagConnect(recipeData.tags) }
      },
      include: recipeInclude
    });

    res.status(201).json(presentRecipe(recipe));
  } catch (error) {
    if (error instanceof ImportError) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

export default router;
