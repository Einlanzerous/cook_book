-- COOK-23: server-side sessions for signed-in contributors.
--
-- EXPAND-ONLY: one new table and its indexes. Nothing existing is altered or
-- dropped, so the previous (2.0.0) image, which has never heard of "Session",
-- still boots and works against the migrated database.
--
-- Rollback: roll the app image back to 2.0.0 and leave this table in place; it
-- is ignored. To remove it as well (only after the image is rolled back):
--   DROP TABLE "Session";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261107120000_session_table';

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_contributorId_idx" ON "Session"("contributorId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
