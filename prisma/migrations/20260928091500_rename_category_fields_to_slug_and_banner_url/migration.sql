-- AlterTable: Rename seo_url to slug and banner to banner_url
ALTER TABLE "categories" RENAME COLUMN "seo_url" TO "slug";
ALTER TABLE "categories" RENAME COLUMN "banner" TO "banner_url";

-- RenameIndex: Rename categories_seo_url_key to categories_slug_key
ALTER INDEX "categories_seo_url_key" RENAME TO "categories_slug_key";
