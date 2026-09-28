-- AlterTable: Add is_active, sort_order, parent_id
ALTER TABLE "categories" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "categories" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "categories" ADD COLUMN "parent_id" UUID;

-- Backfill existing rows if needed
UPDATE "categories" SET "is_active" = true WHERE "is_active" IS NULL;
UPDATE "categories" SET "sort_order" = 0 WHERE "sort_order" IS NULL;

-- CreateIndex
CREATE INDEX "categories_deleted_at_sort_order_name_idx" ON "categories"("deleted_at", "sort_order", "name");
CREATE INDEX "categories_deleted_at_is_active_idx" ON "categories"("deleted_at", "is_active");
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
