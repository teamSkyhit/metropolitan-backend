-- AlterTable: Add name_key, backfill from name, set not null
ALTER TABLE "categories" ADD COLUMN "name_key" VARCHAR(100);
UPDATE "categories" SET "name_key" = LOWER(TRIM("name")) WHERE "name_key" IS NULL;
ALTER TABLE "categories" ALTER COLUMN "name_key" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key_key" ON "categories"("name_key");
