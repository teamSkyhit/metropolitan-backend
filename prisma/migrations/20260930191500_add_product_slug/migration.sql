-- AlterTable: Add nullable slug column first
ALTER TABLE "products" ADD COLUMN "slug" VARCHAR(120);

-- Backfill existing products with deterministic slug generation and collision resolution
WITH base_slugs AS (
  SELECT
    id,
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        LOWER(TRIM("name")),
        '[^a-z0-9]+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    ) AS raw_slug,
    "created_at"
  FROM "products"
),
numbered_slugs AS (
  SELECT
    id,
    CASE
      WHEN raw_slug IS NULL OR raw_slug = '' THEN 'product'
      ELSE SUBSTRING(raw_slug, 1, 100)
    END AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY CASE
        WHEN raw_slug IS NULL OR raw_slug = '' THEN 'product'
        ELSE SUBSTRING(raw_slug, 1, 100)
      END
      ORDER BY "created_at" ASC, id ASC
    ) AS row_num
  FROM base_slugs
)
UPDATE "products" p
SET "slug" = CASE
  WHEN ns.row_num = 1 THEN ns.base_slug
  ELSE ns.base_slug || '-' || ns.row_num
END
FROM numbered_slugs ns
WHERE p.id = ns.id;

-- Enforce NOT NULL on slug column
ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
CREATE INDEX "products_slug_idx" ON "products"("slug");
