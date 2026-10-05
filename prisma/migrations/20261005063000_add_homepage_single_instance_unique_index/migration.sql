-- CreateIndex
CREATE UNIQUE INDEX "homepage_sections_single_instance_active_idx" ON "homepage_sections"("type")
WHERE "deleted_at" IS NULL
  AND "is_active" = true
  AND "type" IN ('HERO', 'FEATURED_PRODUCTS', 'FEATURED_CATEGORIES', 'FEATURED_BRANDS');
