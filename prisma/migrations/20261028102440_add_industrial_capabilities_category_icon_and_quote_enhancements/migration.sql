-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CRM_USER';

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "icon" VARCHAR(100);

-- AlterTable
ALTER TABLE "enquiry_line_items" ADD COLUMN     "product_id_ref" UUID;

-- CreateTable
CREATE TABLE "industrial_capabilities" (
    "id" UUID NOT NULL,
    "number" VARCHAR(20),
    "title" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "image_url" VARCHAR(500),
    "image_media_id" UUID,
    "icon" VARCHAR(100),
    "short_description" VARCHAR(500),
    "description" TEXT,
    "typical_products" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "industrial_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "industrial_capabilities_slug_key" ON "industrial_capabilities"("slug");

-- CreateIndex
CREATE INDEX "industrial_capabilities_deleted_at_sort_order_title_idx" ON "industrial_capabilities"("deleted_at", "sort_order", "title");

-- CreateIndex
CREATE INDEX "industrial_capabilities_deleted_at_is_active_idx" ON "industrial_capabilities"("deleted_at", "is_active");

-- CreateIndex
CREATE INDEX "industrial_capabilities_image_media_id_idx" ON "industrial_capabilities"("image_media_id");

-- CreateIndex
CREATE INDEX "enquiry_line_items_product_id_ref_idx" ON "enquiry_line_items"("product_id_ref");

-- AddForeignKey
ALTER TABLE "enquiry_line_items" ADD CONSTRAINT "enquiry_line_items_product_id_ref_fkey" FOREIGN KEY ("product_id_ref") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "industrial_capabilities" ADD CONSTRAINT "industrial_capabilities_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
