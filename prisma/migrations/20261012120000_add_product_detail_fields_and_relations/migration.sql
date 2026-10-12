-- AlterTable
ALTER TABLE "products" ADD COLUMN "short_description" VARCHAR(500),
ADD COLUMN "overview" TEXT,
ADD COLUMN "series" VARCHAR(100),
ADD COLUMN "meta_title" VARCHAR(200),
ADD COLUMN "meta_description" VARCHAR(500),
ADD COLUMN "meta_keywords" VARCHAR(500),
ADD COLUMN "canonical_url" VARCHAR(500),
ADD COLUMN "og_image_url" VARCHAR(500);

-- CreateTable
CREATE TABLE "product_features" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "icon" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "product_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_key_benefits" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "icon" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "product_key_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_related_products" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "related_product_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_related_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_features_product_id_deleted_at_sort_order_idx" ON "product_features"("product_id", "deleted_at", "sort_order");

-- CreateIndex
CREATE INDEX "product_features_deleted_at_created_at_idx" ON "product_features"("deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "product_key_benefits_product_id_deleted_at_sort_order_idx" ON "product_key_benefits"("product_id", "deleted_at", "sort_order");

-- CreateIndex
CREATE INDEX "product_key_benefits_deleted_at_created_at_idx" ON "product_key_benefits"("deleted_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_related_products_product_id_related_product_id_key" ON "product_related_products"("product_id", "related_product_id");

-- CreateIndex
CREATE INDEX "product_related_products_product_id_sort_order_idx" ON "product_related_products"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "product_related_products_related_product_id_idx" ON "product_related_products"("related_product_id");

-- AddForeignKey
ALTER TABLE "product_features" ADD CONSTRAINT "product_features_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_key_benefits" ADD CONSTRAINT "product_key_benefits_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_related_products" ADD CONSTRAINT "product_related_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_related_products" ADD CONSTRAINT "product_related_products_related_product_id_fkey" FOREIGN KEY ("related_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
