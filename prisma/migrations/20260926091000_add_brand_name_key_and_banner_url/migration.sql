-- AlterTable: Add name_key, backfill from name, set not null, add banner_url
ALTER TABLE "brands" ADD COLUMN "name_key" VARCHAR(100);
UPDATE "brands" SET "name_key" = LOWER(TRIM("name")) WHERE "name_key" IS NULL;
ALTER TABLE "brands" ALTER COLUMN "name_key" SET NOT NULL;

ALTER TABLE "brands" ADD COLUMN "banner_url" VARCHAR(500);

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key_key" ON "brands"("name_key");
