-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "banner_media_id" UUID,
ADD COLUMN     "image_media_id" UUID,
ADD COLUMN     "image_url" VARCHAR(500);

-- CreateTable
CREATE TABLE "product_gallery_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "product_gallery_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_documents" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "original_file_name" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "product_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_gallery_images_product_id_deleted_at_sort_order_idx" ON "product_gallery_images"("product_id", "deleted_at", "sort_order");

-- CreateIndex
CREATE INDEX "product_gallery_images_media_id_idx" ON "product_gallery_images"("media_id");

-- CreateIndex
CREATE INDEX "product_gallery_images_deleted_at_created_at_idx" ON "product_gallery_images"("deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "product_documents_product_id_deleted_at_sort_order_idx" ON "product_documents"("product_id", "deleted_at", "sort_order");

-- CreateIndex
CREATE INDEX "product_documents_media_id_idx" ON "product_documents"("media_id");

-- CreateIndex
CREATE INDEX "product_documents_deleted_at_created_at_idx" ON "product_documents"("deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "categories_image_media_id_idx" ON "categories"("image_media_id");

-- CreateIndex
CREATE INDEX "categories_banner_media_id_idx" ON "categories"("banner_media_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_banner_media_id_fkey" FOREIGN KEY ("banner_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_gallery_images" ADD CONSTRAINT "product_gallery_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_gallery_images" ADD CONSTRAINT "product_gallery_images_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
