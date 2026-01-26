import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get time-based tag
function getTimeTag(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return null;
  if (totalMinutes <= 15) return '15 Minutes';
  if (totalMinutes <= 30) return '30 Minutes';
  if (totalMinutes <= 45) return '45 Minutes';
  if (totalMinutes <= 60) return '1 Hour';
  return '1 Hour+';
}

const sampleRecipes = [
  {
    title: 'Teriyaki Chicken Bowl',
    description: 'A delicious Japanese-inspired bowl with tender chicken, steamed rice, and fresh vegetables drizzled with homemade teriyaki sauce.',
    imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800',
    servings: 4,
    prepTime: 15,
    cookTime: 20,
    tags: ['Japanese', 'Quick', 'Chicken', 'Bowl'],
    ingredients: [
      { name: 'chicken breast', amount: '1.5', unit: 'lb' },
      { name: 'soy sauce', amount: '1/4', unit: 'cup' },
      { name: 'honey', amount: '2', unit: 'tbsp' },
      { name: 'rice vinegar', amount: '1', unit: 'tbsp' },
      { name: 'sesame oil', amount: '1', unit: 'tsp' },
      { name: 'garlic', amount: '3', unit: 'cloves' },
      { name: 'ginger', amount: '1', unit: 'tbsp' },
      { name: 'jasmine rice', amount: '2', unit: 'cups' },
      { name: 'broccoli', amount: '2', unit: 'cups' },
      { name: 'sesame seeds', amount: '1', unit: 'tbsp' }
    ],
    directions: [
      'Cook jasmine rice according to package directions.',
      'Mix soy sauce, honey, rice vinegar, sesame oil, minced garlic, and grated ginger in a bowl for the teriyaki sauce.',
      'Cut chicken breast into bite-sized pieces and season with salt and pepper.',
      'Heat a large skillet over medium-high heat. Cook chicken until golden and cooked through, about 6-7 minutes.',
      'Pour teriyaki sauce over chicken and simmer for 2-3 minutes until sauce thickens.',
      'Steam broccoli until tender-crisp, about 4 minutes.',
      'Serve chicken and broccoli over rice, drizzle with extra sauce and sprinkle with sesame seeds.'
    ]
  },
  {
    title: 'One-Pan Lemon Herb Salmon',
    description: 'Flaky salmon fillets roasted with asparagus and cherry tomatoes in a bright lemon herb sauce. Ready in under 30 minutes!',
    imageUrl: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800',
    servings: 2,
    prepTime: 10,
    cookTime: 20,
    tags: ['One Pan', 'Seafood', 'Healthy', 'Quick'],
    ingredients: [
      { name: 'salmon fillets', amount: '2', unit: 'pieces' },
      { name: 'asparagus', amount: '1', unit: 'bunch' },
      { name: 'cherry tomatoes', amount: '1', unit: 'cup' },
      { name: 'lemon', amount: '1', unit: 'piece' },
      { name: 'olive oil', amount: '3', unit: 'tbsp' },
      { name: 'garlic', amount: '4', unit: 'cloves' },
      { name: 'fresh dill', amount: '2', unit: 'tbsp' },
      { name: 'fresh parsley', amount: '2', unit: 'tbsp' }
    ],
    directions: [
      'Preheat oven to 400°F (200°C).',
      'Trim asparagus and halve cherry tomatoes. Arrange on a baking sheet.',
      'Drizzle vegetables with olive oil, season with salt and pepper.',
      'Place salmon fillets on top of the vegetables.',
      'Mix remaining olive oil with minced garlic, lemon juice, dill, and parsley. Spoon over salmon.',
      'Roast for 15-18 minutes until salmon is cooked through and flakes easily.',
      'Serve immediately with lemon wedges.'
    ]
  },
  {
    title: 'Classic Beef Tacos',
    description: 'Seasoned ground beef in warm tortillas topped with fresh pico de gallo, cheese, and all your favorite toppings.',
    imageUrl: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=800',
    servings: 4,
    prepTime: 15,
    cookTime: 15,
    tags: ['Mexican', 'Quick', 'Beef'],
    ingredients: [
      { name: 'ground beef', amount: '1', unit: 'lb' },
      { name: 'taco seasoning', amount: '2', unit: 'tbsp' },
      { name: 'corn tortillas', amount: '8', unit: 'pieces' },
      { name: 'Roma tomatoes', amount: '3', unit: 'pieces' },
      { name: 'white onion', amount: '1/2', unit: 'piece' },
      { name: 'fresh cilantro', amount: '1/4', unit: 'cup' },
      { name: 'lime', amount: '2', unit: 'pieces' },
      { name: 'cheddar cheese', amount: '1', unit: 'cup' },
      { name: 'sour cream', amount: '1/2', unit: 'cup' }
    ],
    directions: [
      'Brown ground beef in a large skillet over medium-high heat, breaking it up as it cooks.',
      'Drain excess fat and add taco seasoning with 1/4 cup water. Simmer for 5 minutes.',
      'Make pico de gallo: dice tomatoes and onion, chop cilantro, mix with lime juice and salt.',
      'Warm tortillas in a dry skillet or directly over gas flame.',
      'Assemble tacos with seasoned beef, pico de gallo, shredded cheese, and sour cream.',
      'Serve with lime wedges on the side.'
    ]
  },
  {
    title: 'Vegetable Stir Fry',
    description: 'A colorful medley of crisp vegetables in a savory ginger-garlic sauce. Perfect as a main dish or side.',
    imageUrl: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800',
    servings: 4,
    prepTime: 15,
    cookTime: 10,
    tags: ['Vegetarian', 'Quick', 'Asian', 'Healthy'],
    ingredients: [
      { name: 'broccoli florets', amount: '2', unit: 'cups' },
      { name: 'bell peppers', amount: '2', unit: 'pieces' },
      { name: 'snap peas', amount: '1', unit: 'cup' },
      { name: 'carrots', amount: '2', unit: 'pieces' },
      { name: 'mushrooms', amount: '8', unit: 'oz' },
      { name: 'soy sauce', amount: '3', unit: 'tbsp' },
      { name: 'sesame oil', amount: '2', unit: 'tbsp' },
      { name: 'garlic', amount: '4', unit: 'cloves' },
      { name: 'fresh ginger', amount: '1', unit: 'tbsp' },
      { name: 'cornstarch', amount: '1', unit: 'tsp' }
    ],
    directions: [
      'Cut all vegetables into bite-sized pieces. Slice carrots on the diagonal.',
      'Mix soy sauce, sesame oil, minced garlic, grated ginger, and cornstarch in a small bowl.',
      'Heat a wok or large skillet over high heat until smoking.',
      'Add vegetables in order of density: carrots first, then broccoli, peppers, mushrooms, and snap peas.',
      'Stir-fry for 4-5 minutes until vegetables are tender-crisp.',
      'Pour sauce over vegetables and toss to coat. Cook 1 more minute.',
      'Serve immediately over rice or noodles.'
    ]
  },
  {
    title: 'Creamy Tuscan Chicken',
    description: 'Pan-seared chicken breasts in a rich sun-dried tomato and spinach cream sauce. Restaurant quality at home!',
    imageUrl: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800',
    servings: 4,
    prepTime: 10,
    cookTime: 25,
    tags: ['Italian', 'One Pan', 'Chicken'],
    ingredients: [
      { name: 'chicken breasts', amount: '4', unit: 'pieces' },
      { name: 'heavy cream', amount: '1', unit: 'cup' },
      { name: 'parmesan cheese', amount: '1/2', unit: 'cup' },
      { name: 'sun-dried tomatoes', amount: '1/2', unit: 'cup' },
      { name: 'fresh spinach', amount: '3', unit: 'cups' },
      { name: 'garlic', amount: '4', unit: 'cloves' },
      { name: 'Italian seasoning', amount: '1', unit: 'tsp' },
      { name: 'olive oil', amount: '2', unit: 'tbsp' },
      { name: 'chicken broth', amount: '1/2', unit: 'cup' }
    ],
    directions: [
      'Pound chicken breasts to even thickness. Season with salt, pepper, and Italian seasoning.',
      'Heat olive oil in a large skillet over medium-high heat. Sear chicken 6-7 minutes per side until golden and cooked through. Set aside.',
      'In the same pan, sauté minced garlic for 30 seconds until fragrant.',
      'Add sun-dried tomatoes and chicken broth. Simmer for 2 minutes.',
      'Reduce heat and stir in heavy cream and parmesan cheese. Simmer until slightly thickened.',
      'Add spinach and stir until wilted.',
      'Return chicken to the pan and spoon sauce over it. Serve with pasta or crusty bread.'
    ]
  },
  {
    title: 'Thai Basil Fried Rice',
    description: 'Aromatic fried rice with Thai basil, vegetables, and a perfectly fried egg on top. Sweet, salty, and a little spicy!',
    imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800',
    servings: 2,
    prepTime: 10,
    cookTime: 15,
    tags: ['Thai', 'Quick', 'Asian'],
    ingredients: [
      { name: 'cooked jasmine rice', amount: '3', unit: 'cups' },
      { name: 'Thai basil leaves', amount: '1', unit: 'cup' },
      { name: 'eggs', amount: '3', unit: 'pieces' },
      { name: 'garlic', amount: '4', unit: 'cloves' },
      { name: 'Thai chilies', amount: '2', unit: 'pieces' },
      { name: 'fish sauce', amount: '2', unit: 'tbsp' },
      { name: 'soy sauce', amount: '1', unit: 'tbsp' },
      { name: 'sugar', amount: '1', unit: 'tsp' },
      { name: 'vegetable oil', amount: '3', unit: 'tbsp' },
      { name: 'onion', amount: '1', unit: 'piece' }
    ],
    directions: [
      'Use day-old rice for best results, or spread fresh rice on a sheet pan to cool.',
      'Mince garlic and Thai chilies. Slice onion thinly.',
      'Heat 2 tbsp oil in a wok over high heat. Scramble 1 egg, break into pieces, set aside.',
      'Add remaining oil. Stir-fry garlic and chilies for 30 seconds.',
      'Add onion and cook for 1 minute. Add rice and toss continuously.',
      'Season with fish sauce, soy sauce, and sugar. Toss well.',
      'Add scrambled egg and Thai basil. Toss until basil wilts.',
      'Fry remaining eggs sunny-side up. Serve rice topped with fried eggs.'
    ]
  },
  {
    title: 'Mediterranean Quinoa Salad',
    description: 'A refreshing grain salad with cucumber, tomatoes, olives, and feta cheese in a lemon herb vinaigrette.',
    imageUrl: 'https://images.unsplash.com/photo-1505576399279-565b52d4ac71?w=800',
    servings: 6,
    prepTime: 20,
    cookTime: 15,
    tags: ['Healthy', 'Vegetarian', 'Mediterranean', 'Salad'],
    ingredients: [
      { name: 'quinoa', amount: '1.5', unit: 'cups' },
      { name: 'cucumber', amount: '1', unit: 'large' },
      { name: 'cherry tomatoes', amount: '2', unit: 'cups' },
      { name: 'kalamata olives', amount: '1/2', unit: 'cup' },
      { name: 'feta cheese', amount: '1', unit: 'cup' },
      { name: 'red onion', amount: '1/2', unit: 'piece' },
      { name: 'fresh parsley', amount: '1/2', unit: 'cup' },
      { name: 'lemon juice', amount: '1/4', unit: 'cup' },
      { name: 'olive oil', amount: '1/3', unit: 'cup' },
      { name: 'dried oregano', amount: '1', unit: 'tsp' }
    ],
    directions: [
      'Rinse quinoa and cook according to package directions. Spread on a sheet pan to cool.',
      'Dice cucumber, halve cherry tomatoes, slice olives, and dice red onion.',
      'Whisk together olive oil, lemon juice, oregano, salt, and pepper for the dressing.',
      'In a large bowl, combine cooled quinoa with all vegetables.',
      'Pour dressing over salad and toss to combine.',
      'Crumble feta cheese on top and garnish with fresh parsley.',
      'Serve immediately or refrigerate. Flavors improve after an hour.'
    ]
  },
  {
    title: 'Honey Garlic Shrimp',
    description: 'Succulent shrimp glazed in a sticky honey garlic sauce. Dinner is ready in just 15 minutes!',
    imageUrl: 'https://images.unsplash.com/photo-1599084993091-1cb5c0721cc6?w=800',
    servings: 4,
    prepTime: 5,
    cookTime: 10,
    tags: ['Seafood', 'Quick', 'Asian'],
    ingredients: [
      { name: 'large shrimp', amount: '1.5', unit: 'lb' },
      { name: 'honey', amount: '1/4', unit: 'cup' },
      { name: 'soy sauce', amount: '3', unit: 'tbsp' },
      { name: 'garlic', amount: '6', unit: 'cloves' },
      { name: 'butter', amount: '2', unit: 'tbsp' },
      { name: 'lemon juice', amount: '1', unit: 'tbsp' },
      { name: 'red pepper flakes', amount: '1/4', unit: 'tsp' },
      { name: 'green onions', amount: '3', unit: 'pieces' }
    ],
    directions: [
      'Peel and devein shrimp if needed. Pat dry with paper towels.',
      'Mix honey, soy sauce, and lemon juice in a small bowl.',
      'Melt butter in a large skillet over medium-high heat.',
      'Add minced garlic and red pepper flakes. Sauté for 30 seconds.',
      'Add shrimp in a single layer. Cook 1-2 minutes per side until pink.',
      'Pour honey garlic sauce over shrimp. Toss and cook 1 minute until sauce thickens and coats shrimp.',
      'Garnish with sliced green onions. Serve over rice or with crusty bread.'
    ]
  }
];

async function seed() {
  console.log('Seeding database...');

  // Clear existing data
  await prisma.ingredient.deleteMany();
  await prisma.direction.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.tag.deleteMany();

  for (const recipe of sampleRecipes) {
    // Add time-based tag
    const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);
    const timeTag = getTimeTag(totalTime);
    const allTags = timeTag ? [timeTag, ...recipe.tags] : recipe.tags;

    await prisma.recipe.create({
      data: {
        title: recipe.title,
        description: recipe.description,
        imageUrl: recipe.imageUrl,
        servings: recipe.servings,
        prepTime: recipe.prepTime,
        cookTime: recipe.cookTime,
        source: 'manual',
        ingredients: {
          create: recipe.ingredients
        },
        directions: {
          create: recipe.directions.map((instruction, index) => ({
            stepNumber: index + 1,
            instruction
          }))
        },
        tags: {
          connectOrCreate: allTags.map(tag => ({
            where: { name: tag },
            create: { name: tag }
          }))
        }
      }
    });
    console.log(`Created recipe: ${recipe.title}`);
  }

  console.log('Seeding complete!');
}

seed()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
