-- AlterTable
ALTER TABLE "contact_submissions" ADD COLUMN "created_by_id" UUID,
ADD COLUMN "updated_by_id" UUID;

-- CreateIndex
CREATE INDEX "contact_submissions_name_idx" ON "contact_submissions"("name");
