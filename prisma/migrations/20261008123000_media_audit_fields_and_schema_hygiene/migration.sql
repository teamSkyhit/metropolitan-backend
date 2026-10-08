-- AlterTable
ALTER TABLE "media" ADD COLUMN "created_by_id" UUID,
ADD COLUMN "updated_by_id" UUID;

-- DropIndex
DROP INDEX IF EXISTS "products_sku_idx";
