/**
 * Development seed: the Commonplace canvas sample data (six cooks, ten recipes
 * from HelloFresh, NYT Cooking, Grandma Ada's cards and "Added via Claude").
 *
 *   make db-seed                 fresh database only
 *   make db-seed-force           wipe recipes/contributors/tags first
 *   node prisma/seed.js --force  the same, by hand
 *
 * THIS SCRIPT DELETES DATA. It refuses to run (non-zero exit, nothing deleted):
 *   - when NODE_ENV=production, always (`--force` does NOT override this);
 *   - when the database already holds any Recipe, or any Contributor other than
 *     the default 'magos' (the migration creates that one), unless `--force`.
 * NODE_ENV is not set in the Dockerfile, so the second rule is the real
 * protection against pointing this at a database with real recipes in it.
 *
 * 'magos' is recreated among the cooks: the API falls back to it when a create
 * carries no contributorId.
 */
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { prepareIngredient } from '../src/services/quantity.js';
import { toTitleCase, DEFAULT_CONTRIBUTOR_NAME } from '../src/services/recipeWrite.js';

export const COOKS = [
  { key: 'magos', name: DEFAULT_CONTRIBUTOR_NAME, bio: 'Keeps the house cookbook running.', joinedAt: '2026-01-05T10:00:00Z' },
  { key: 'mara', name: 'Mara Okafor', bio: "Weeknight bowls, and her grandmother's recipe cards.", joinedAt: '2026-02-03T18:00:00Z' },
  { key: 'theo', name: 'Theo Brandt', bio: 'Pasta on Tuesdays, shrimp on Fridays.', joinedAt: '2026-02-20T18:00:00Z' },
  { key: 'ines', name: 'Ines Rojas', bio: 'Noodles, stir fries, anything under 30 minutes.', joinedAt: '2026-03-02T18:00:00Z' },
  { key: 'sam', name: 'Sam Kim', bio: 'Cuts recipes out of the Sunday paper.', joinedAt: '2026-03-15T18:00:00Z' },
  { key: 'wren', name: 'Wren Ellis', bio: 'Newest cook; no recipes filed yet.', joinedAt: '2026-04-01T18:00:00Z' }
];

const HF = 'HelloFresh';
const ADA = 'Grandma Ada’s card';
const NYT = 'NYT Cooking';
const CLAUDE = 'Added via Claude';

// amount/unit are display text; quantity is derived by the same write-path
// helper the API uses. '1 thumb' (quantity NULL) and a blank-amount
// 'Salt & pepper' are the COOK-9 edge cases.
const ing = (amount, unit, name) => ({ amount: amount || null, unit: unit || null, name });
const step = (heading, instruction) => ({ heading, instruction });

// Tags are protein / dish-type only: cuisine, category, time and vegetarian
// live in columns (COOK-6), never in tags.
export const RECIPES = [
  {
    title: 'Beef & Zucchini Bibimbap with Carrots & Pickled Scallions',
    description: "Named for the Korean word for mixing rice — which is exactly what you do once it's served. Sweet carrot ribbons, tender zucchini, and beef tossed with garlic, ginger, and soy.",
    cook: 'mara', source: HF, sourceUrl: 'https://www.hellofresh.com/recipes/beef-zucchini-bibimbap-example',
    category: 'Main course', cuisine: 'Korean', servings: 2, prepTime: 10, cookTime: 20, estimated: true,
    vegetarian: false, createdAt: '2026-03-12T09:30:00Z',
    notes: 'Swap in chicken for beef — pat dry, cook through, no need to break it up.',
    tags: ['Beef', 'Bowl'],
    ingredients: [
      ing('¾', 'cup', 'Jasmine rice'), ing('2', null, 'Scallions'), ing('6', 'oz', 'Carrots'), ing('1', null, 'Zucchini'),
      ing('1 thumb', null, 'Ginger'), ing('1', 'clove', 'Garlic'), ing('5', 'tsp', 'White wine vinegar'),
      ing('1', 'tbsp', 'Sesame oil'), ing('½', 'oz', 'Gochujang'), ing('2', 'tbsp', 'Soy sauce'),
      ing('10', 'oz', 'Ground beef'), ing('1', 'tbsp', 'Sugar'), ing('1', 'tbsp', 'Cooking oil'), ing('', null, 'Salt & pepper')
    ],
    directions: [
      step('Cook the rice', 'In a small pot, combine rice, 1¼ cups water (2½ for 4) and a big pinch of salt. Boil, then cover and simmer until tender, 15–18 minutes. Keep covered off heat.'),
      step('Prep', 'Thinly slice scallions, separating whites from greens. Peel carrots and shave into ribbons, rotating as you go. Halve zucchini lengthwise and slice into half-moons. Mince ginger and garlic.'),
      step('Pickle & mix the sauce', 'Combine scallion whites, vinegar and a pinch of salt; set aside. In another bowl, stir sesame oil, gochujang, half the soy sauce and 1 tbsp sugar (2 for 4) until dissolved.'),
      step('Cook the vegetables', 'Heat a drizzle of oil over medium-high. Cook carrots until slightly softened, 3–4 minutes; set aside. Repeat with zucchini until browned, 3–5 minutes per side.'),
      step('Cook the beef', 'Heat more oil in the same pan. Add beef, ginger and garlic; cook, breaking up, until browned, 4–6 minutes. Add remaining soy sauce and cook until mostly evaporated, 1–2 minutes.'),
      step('Serve', 'Fluff rice and divide between bowls. Top with beef and vegetables, pickled scallions and their liquid, the sauce, and scallion greens.')
    ]
  },
  {
    title: 'Chicken & Mushroom Truffle Pasta', cook: 'theo', source: HF, sourceUrl: 'https://www.hellofresh.com/recipes/truffle-pasta-example',
    description: 'Creamy, earthy pasta that comes together in one pan.',
    category: 'Main course', cuisine: 'Italian', servings: 2, prepTime: 7, cookTime: 13, estimated: true, vegetarian: false,
    createdAt: '2026-03-10T18:00:00Z', tags: ['Chicken', 'Pasta'],
    ingredients: [ing('6', 'oz', 'Rigatoni'), ing('8', 'oz', 'Chicken breast'), ing('6', 'oz', 'Mushrooms'), ing('2', 'tbsp', 'Truffle butter'), ing('¼', 'cup', 'Parmesan')],
    directions: [step('Boil', 'Boil the pasta in salted water until al dente; save a mug of the water.'), step('Sear', 'Sear sliced chicken and mushrooms until golden.'), step('Toss', 'Toss everything with truffle butter, Parmesan and a splash of pasta water.')]
  },
  {
    title: 'Homestyle Chicken & Biscuit Pie', cook: 'mara', source: HF, sourceUrl: 'https://www.hellofresh.com/recipes/biscuit-pie-example',
    description: 'A skillet pot pie with a drop-biscuit lid.',
    category: 'Main course', cuisine: 'American', servings: 2, prepTime: 15, cookTime: 30, estimated: true, vegetarian: false,
    createdAt: '2026-03-08T18:00:00Z', tags: ['Chicken'],
    ingredients: [ing('10', 'oz', 'Chicken thigh'), ing('1', 'cup', 'Frozen peas and carrots'), ing('1½', 'cups', 'Chicken stock'), ing('4', null, 'Biscuit rounds')],
    directions: [step('Simmer', 'Brown the chicken, add vegetables and stock, simmer until thick.'), step('Top and bake', 'Arrange biscuits on top and bake until risen and golden.')]
  },
  {
    title: 'Creamy Mushroom Chowder', cook: 'mara', source: ADA,
    description: "From Grandma Ada's recipe card, copied word for word.",
    category: 'Soup', cuisine: 'American', servings: 4, prepTime: 5, cookTime: 10, vegetarian: true,
    createdAt: '2026-03-05T18:00:00Z', tags: ['Comfort Food'], notes: 'Better the next day.',
    ingredients: [ing('1', 'lb', 'Mushrooms'), ing('2', 'tbsp', 'Butter'), ing('2', 'cups', 'Milk'), ing('1', null, 'Potato'), ing('', null, 'Salt & pepper')],
    directions: [step(null, 'Sauté the mushrooms in butter.'), step(null, 'Add diced potato and milk; simmer until tender, then blend half.')]
  },
  {
    title: 'Chicken Ramen in Shoyu Broth', cook: 'ines', source: HF, sourceUrl: 'https://www.hellofresh.com/recipes/chicken-ramen-example',
    description: 'A quick shoyu broth with soft egg and scallions.',
    category: 'Soup', cuisine: 'Japanese', servings: 2, prepTime: 15, cookTime: 30, estimated: true, vegetarian: false,
    createdAt: '2026-03-01T18:00:00Z', tags: ['Chicken', 'Noodles'],
    ingredients: [ing('2', null, 'Ramen nests'), ing('2', 'cups', 'Chicken broth'), ing('2', 'tbsp', 'Soy sauce'), ing('2', null, 'Eggs'), ing('1', 'thumb', 'Ginger')],
    directions: [step('Broth', 'Simmer broth with soy and ginger.'), step('Noodles', 'Cook noodles separately, then combine in bowls.'), step('Top', 'Top with halved soft eggs and scallions.')]
  },
  {
    title: 'Lemony Herbed Chicken & Couscous', cook: 'sam', source: NYT, sourceUrl: 'https://cooking.nytimes.com/recipes/example-lemony-chicken',
    description: 'Bright, herby, and on the table in 20 minutes.',
    category: 'Main course', cuisine: 'Mediterranean', servings: 2, prepTime: 8, cookTime: 12, vegetarian: false,
    createdAt: '2026-02-24T18:00:00Z', tags: ['Chicken'],
    ingredients: [ing('2', null, 'Chicken cutlets'), ing('1', 'cup', 'Pearl couscous'), ing('1', null, 'Lemon'), ing('¼', 'cup', 'Chopped herbs')],
    directions: [step('Cook the couscous', 'Toast, then simmer the couscous in water.'), step('Cook the chicken', 'Pan-fry the cutlets, finish with lemon and herbs.')]
  },
  {
    title: 'Tuscan Beef-Stuffed Peppers', cook: 'mara', source: ADA,
    description: 'Another of Grandma Ada’s cards, scaled up for a crowd.',
    category: 'Main course', cuisine: 'Italian', servings: 4, prepTime: 15, cookTime: 20, vegetarian: false,
    createdAt: '2026-02-18T18:00:00Z', tags: ['Beef'],
    ingredients: [ing('4', null, 'Bell peppers'), ing('1', 'lb', 'Ground beef'), ing('1½', 'cups', 'Cooked rice'), ing('1', 'cup', 'Tomato sauce')],
    directions: [step('Fill', 'Halve and seed peppers; fill with beef, rice and sauce.'), step('Bake', 'Bake covered until the peppers are soft.')]
  },
  {
    title: 'Honey Garlic Shrimp', cook: 'theo', source: CLAUDE,
    description: 'A sticky, fast weeknight shrimp.',
    category: 'Main course', cuisine: 'American', servings: 4, prepTime: 5, cookTime: 10, vegetarian: false,
    createdAt: '2026-02-10T18:00:00Z', tags: ['Seafood'],
    ingredients: [ing('1', 'lb', 'Shrimp'), ing('3', 'cloves', 'Garlic'), ing('3', 'tbsp', 'Honey'), ing('2', 'tbsp', 'Soy sauce')],
    directions: [step('Sauce', 'Whisk honey, soy and garlic.'), step('Cook', 'Sear shrimp 1–2 minutes a side, add sauce, toss until glossy.')]
  },
  {
    title: 'Vegetable Stir Fry', cook: 'ines', source: CLAUDE,
    description: 'Whatever is in the crisper, in a hot pan.',
    category: 'Main course', cuisine: 'Asian', servings: 4, prepTime: 10, cookTime: 15, vegetarian: true,
    createdAt: '2026-02-05T18:00:00Z', tags: ['Weeknight'],
    ingredients: [ing('4', 'cups', 'Mixed vegetables'), ing('2', 'tbsp', 'Soy sauce'), ing('1', 'tbsp', 'Cornstarch'), ing('1 thumb', null, 'Ginger'), ing('', null, 'Salt & pepper')],
    directions: [step('Prep', 'Cut vegetables small and even.'), step('Stir fry', 'Fry hardest vegetables first, then add the sauce.')]
  },
  {
    title: 'Mediterranean Quinoa Salad', cook: 'sam', source: NYT, sourceUrl: 'https://cooking.nytimes.com/recipes/example-quinoa-salad',
    description: 'A make-ahead salad that holds for days.',
    category: 'Salad', cuisine: 'Mediterranean', servings: 6, prepTime: 20, cookTime: 15, vegetarian: true,
    createdAt: '2026-01-28T18:00:00Z', tags: ['Make-Ahead'],
    ingredients: [ing('1½', 'cups', 'Quinoa'), ing('1', null, 'Cucumber'), ing('1', 'cup', 'Cherry tomatoes'), ing('½', 'cup', 'Feta')],
    directions: [step('Cook the quinoa', 'Simmer quinoa, fluff, and cool.'), step('Assemble', 'Toss with chopped vegetables, feta and dressing.')]
  }
];

export class SeedRefusal extends Error {}

/** Throws SeedRefusal unless it is safe to wipe and reseed. Deletes nothing. */
export async function assertSafeToSeed(prisma, { force = false, env = process.env } = {}) {
  if (env.NODE_ENV === 'production') {
    throw new SeedRefusal('NODE_ENV=production: refusing to seed (--force does not override this).');
  }
  if (force) return;
  const recipes = await prisma.recipe.count();
  const others = await prisma.contributor.count({
    where: { NOT: { name: { equals: DEFAULT_CONTRIBUTOR_NAME, mode: 'insensitive' } } }
  });
  if (recipes > 0 || others > 0) {
    throw new SeedRefusal(
      `Database already holds ${recipes} recipe(s) and ${others} non-default contributor(s): ` +
      'refusing to delete them. Pass --force (make db-seed-force) to wipe and reseed a development database.'
    );
  }
}

export async function seed(prisma, { force = false, env = process.env } = {}) {
  await assertSafeToSeed(prisma, { force, env });
  console.log('Seeding database...');

  // Clear existing data: recipes before contributors (ON DELETE RESTRICT).
  await prisma.ingredient.deleteMany();
  await prisma.direction.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.contributor.deleteMany();

  const ids = {};
  for (const c of COOKS) {
    const created = await prisma.contributor.create({
      data: { name: c.name, bio: c.bio, joinedAt: new Date(c.joinedAt) }
    });
    ids[c.key] = created.id;
  }

  for (const r of RECIPES) {
    await prisma.recipe.create({
      data: {
        title: r.title,
        description: r.description,
        servings: r.servings,
        prepTime: r.prepTime,
        cookTime: r.cookTime,
        totalMinutes: r.prepTime + r.cookTime,
        timeSplitEstimated: Boolean(r.estimated),
        source: r.source,
        sourceUrl: r.sourceUrl ?? null,
        category: toTitleCase(r.category),
        cuisine: toTitleCase(r.cuisine),
        vegetarian: r.vegetarian,
        notes: r.notes ?? null,
        createdAt: new Date(r.createdAt),
        contributorId: ids[r.cook],
        ingredients: { create: r.ingredients.map(prepareIngredient) },
        directions: {
          create: r.directions.map((d, i) => ({ stepNumber: i + 1, heading: d.heading, instruction: d.instruction }))
        },
        tags: { connectOrCreate: r.tags.map((name) => ({ where: { name }, create: { name } })) }
      }
    });
    console.log(`Created recipe: ${r.title}`);
  }

  console.log('Seeding complete!');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const prisma = new PrismaClient();
  seed(prisma, { force: process.argv.includes('--force') })
    .catch((e) => {
      console.error(e instanceof SeedRefusal ? `Refusing to seed: ${e.message}` : e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
