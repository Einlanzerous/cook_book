-- AlterTable
ALTER TABLE "Direction" ADD COLUMN     "heading" TEXT;

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "quantity" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "category" TEXT,
ADD COLUMN     "contributorId" TEXT,
ADD COLUMN     "cuisine" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "timeSplitEstimated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totalMinutes" INTEGER,
ADD COLUMN     "vegetarian" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Contributor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "portraitUrl" TEXT,
    "email" TEXT,
    "externalId" TEXT,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_email_key" ON "Contributor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_externalId_key" ON "Contributor"("externalId");

-- CreateIndex
CREATE INDEX "Recipe_contributorId_idx" ON "Recipe"("contributorId");

-- CreateIndex
CREATE INDEX "Recipe_totalMinutes_idx" ON "Recipe"("totalMinutes");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions (Prisma cannot express expression indexes or write
-- backfills; see docs/runbook.md). Additive only: nothing is dropped, renamed,
-- retyped or rewritten, so the previous app image keeps working.

-- Contributor names are unique case-insensitively ('Ada' after 'ada' conflicts).
CREATE UNIQUE INDEX "Contributor_lower_name_key" ON "Contributor"(lower("name"));

-- Source reads and counts are case-insensitive (lower(trim(source)) in queries).
CREATE INDEX "Recipe_lower_source_idx" ON "Recipe"(lower("source"));

-- Backfill 1: the default contributor. Literal name; id from gen_random_uuid()
-- (PG13+, Prisma's uuid() default is client-side). Created on an empty database
-- too: the API falls back to it when a create carries no contributorId.
-- "createdAt" is timestamp without time zone holding UTC, so convert explicitly
-- (independent of the session TimeZone).
INSERT INTO "Contributor" ("id", "name", "joinedAt")
SELECT gen_random_uuid()::text,
       'magos',
       coalesce((SELECT min("createdAt") FROM "Recipe") AT TIME ZONE 'UTC', now());

-- Backfill 2: every existing recipe belongs to the default contributor.
UPDATE "Recipe"
SET "contributorId" = (SELECT "id" FROM "Contributor" WHERE lower("name") = 'magos');

-- Backfill 3: stored total where either part is set.
UPDATE "Recipe"
SET "totalMinutes" = coalesce("prepTime", 0) + coalesce("cookTime", 0)
WHERE "prepTime" IS NOT NULL OR "cookTime" IS NOT NULL;

-- Backfill 4: HelloFresh rows whose split is exactly the importer's guess
-- (prep = round(total / 3), cook = the rest) are flagged as estimated. The only
-- division is by the constant 3. prepTime/cookTime themselves are never changed.
UPDATE "Recipe"
SET "timeSplitEstimated" = true
WHERE lower(trim("source")) = 'hellofresh'
  AND "prepTime" IS NOT NULL
  AND "cookTime" IS NOT NULL
  AND "prepTime" + "cookTime" > 0
  AND "prepTime" = round(("prepTime" + "cookTime")::numeric / 3)
  AND "cookTime" = ("prepTime" + "cookTime") - "prepTime";

-- Backfill 5: vegetarian where any tag is 'vegetarian' or 'veggie'.
-- (_RecipeTags."A" is Recipe.id, "B" is Tag.id.) Legacy tags are left in place.
UPDATE "Recipe"
SET "vegetarian" = true
WHERE EXISTS (
  SELECT 1
  FROM "_RecipeTags" rt
  JOIN "Tag" t ON t."id" = rt."B"
  WHERE rt."A" = "Recipe"."id"
    AND lower(t."name") IN ('vegetarian', 'veggie')
);
