/** schema.org/Recipe fixtures for COOK-14. Synthetic; no real site's content. */

// The shape the "Test run for MCP" prompt asks for: a bare Recipe, strings
// for steps, comma keywords, an ISO total.
export const promptRecipe = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Lemon Lentil Soup',
  description: 'A bright, quick soup.',
  image: ['https://example.com/lentil.jpg'],
  author: { '@type': 'Person', name: 'Gran' },
  url: 'https://example.com/lentil-soup',
  recipeYield: '4 servings',
  prepTime: 'PT10M',
  cookTime: 'PT35M',
  totalTime: 'PT45M',
  recipeCategory: 'Soup',
  recipeCuisine: 'Mediterranean',
  keywords: 'lentil, soup, weeknight, Lentil',
  suitableForDiet: 'https://schema.org/VegetarianDiet',
  recipeIngredient: ['1 1/2 cups red lentils', '2 cloves garlic, minced', '1-2 tbsp olive oil', '½ tsp cumin', 'salt to taste'],
  recipeInstructions: ['Saute the garlic in the oil.', 'Add lentils and 4 cups water; simmer 25 minutes.', 'Finish with lemon.']
};

// A HelloFresh-like page: totalTime only, image array, HowToStep objects.
export const helloFreshLike = {
  '@context': 'http://schema.org',
  '@type': 'Recipe',
  name: 'Crispy Chicken Bowl',
  image: ['https://img.example.com/a.jpg', 'https://img.example.com/b.jpg'],
  totalTime: 'PT30M',
  recipeYield: 2,
  recipeCategory: ['Dinner'],
  recipeCuisine: ['American'],
  recipeIngredient: ['2 unit Chicken Breast', '6 ounce Rice', 'Salt'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Cook the rice.' },
    { '@type': 'HowToStep', text: 'Sear the chicken.' }
  ]
};

export const withSections = {
  '@type': 'Recipe',
  name: 'Layered Cake',
  recipeIngredient: ['2 cups flour'],
  recipeInstructions: [
    {
      '@type': 'HowToSection',
      name: 'Cake',
      itemListElement: [
        { '@type': 'HowToStep', text: 'Mix the batter.' },
        { '@type': 'HowToStep', text: 'Bake for 30 minutes.' }
      ]
    },
    {
      '@type': 'HowToSection',
      name: 'Frosting',
      itemListElement: [{ '@type': 'HowToStep', text: 'Whip the cream.' }]
    },
    { '@type': 'HowToStep', name: 'Assemble', text: 'Stack and frost.' }
  ]
};

export const inGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', name: 'Example Kitchen', url: 'https://example.com' },
    { '@type': ['Recipe', 'Thing'], name: 'Graph Pancakes', recipeIngredient: ['1 cup milk'], recipeInstructions: 'Mix.\n\nFry.' },
    { '@type': 'BreadcrumbList', itemListElement: [] }
  ]
};
