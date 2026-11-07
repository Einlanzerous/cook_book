-- SYNTHETIC data staged at the `init` schema, before the COOK-6 migration.
-- Awkward on purpose; nothing here is real or copied from production.
-- createdAt/updatedAt are UTC wall-clock values (timestamp without time zone).

INSERT INTO "Recipe" ("id","title","servings","prepTime","cookTime","source","sourceUrl","createdAt","updatedAt") VALUES
 ('r-hf-lower',   'HF lowercase, split matches',   2,    10,   20,   'hellofresh',  'https://www.hellofresh.com/recipes/a', '2026-01-05 10:00:00', '2026-01-06 11:00:00'),
 ('r-hf-space',   'HF trailing space, matches',    2,    5,    10,   'HelloFresh ', 'https://www.hellofresh.com/recipes/b', '2026-02-01 08:30:00', '2026-02-01 08:30:00'),
 ('r-hf-nomatch', 'HF split does not match',       2,    10,   10,   'hellofresh',  'https://www.hellofresh.com/recipes/c', '2026-03-01 09:00:00', '2026-03-02 09:00:00'),
 ('r-man-url',    'Manual with URL',               4,    15,   15,   'manual',      'https://example.com/soup',            '2026-04-01 12:00:00', '2026-04-01 12:00:00'),
 ('r-man-bare',   'Manual, no times, no servings', NULL, NULL, NULL, 'manual',      NULL,                                  '2026-05-01 12:00:00', '2026-05-01 12:00:00'),
 ('r-hf-prepnly', 'HF prep only',                  2,    20,   NULL, 'hellofresh',  NULL,                                  '2026-06-01 12:00:00', '2026-06-01 12:00:00'),
 ('r-hf-zero',    'HF zero times',                 2,    0,    0,    'HelloFresh',  NULL,                                  '2026-07-01 12:00:00', '2026-07-01 12:00:00'),
 ('r-veg',        'Tagged veggie',                 2,    NULL, 12,   'manual',      NULL,                                  '2026-08-01 12:00:00', '2026-08-01 12:00:00');

INSERT INTO "Ingredient" ("id","name","amount","unit","recipeId") VALUES
 ('i1','Israeli Couscous','1','unit','r-hf-lower'),
 ('i2','/2 cup Israeli Couscous','1',NULL,'r-hf-lower'),
 ('i3','Salt',NULL,NULL,'r-hf-lower'),
 ('i4','Ginger','1','thumb','r-man-url');

INSERT INTO "Direction" ("id","stepNumber","instruction","recipeId") VALUES
 ('d1',1,'• Boil the water.','r-hf-lower'),
 ('d2',2,'Serve.','r-hf-lower'),
 ('d3',1,'Stir.','r-man-url');

INSERT INTO "Tag" ("id","name") VALUES
 ('t1','Vegetarian'), ('t2','vegetarian'), ('t3','Veggie'), ('t4','Chicken'), ('t5','30 Minutes');

-- _RecipeTags: "A" = Recipe.id, "B" = Tag.id
INSERT INTO "_RecipeTags" ("A","B") VALUES
 ('r-veg','t1'), ('r-man-url','t2'), ('r-man-bare','t3'),
 ('r-hf-lower','t4'), ('r-hf-lower','t5');
