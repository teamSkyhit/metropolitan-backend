-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "seo_url" VARCHAR(120) NOT NULL,
    "banner" VARCHAR(500),
    "description" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_seo_url_key" ON "categories"("seo_url");

-- CreateIndex
CREATE INDEX "categories_deleted_at_created_at_idx" ON "categories"("deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "categories_name_idx" ON "categories"("name");
