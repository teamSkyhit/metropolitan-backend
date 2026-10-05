-- CreateTable
CREATE TABLE "homepage_sections" (
    "id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200),
    "subtitle" VARCHAR(500),
    "content" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homepage_sections_deleted_at_is_active_sort_order_idx" ON "homepage_sections"("deleted_at", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "homepage_sections_deleted_at_sort_order_idx" ON "homepage_sections"("deleted_at", "sort_order");

-- CreateIndex
CREATE INDEX "homepage_sections_deleted_at_type_idx" ON "homepage_sections"("deleted_at", "type");
