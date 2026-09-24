-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'ASSIGNED', 'CONTACTED', 'QUOTATION_SENT', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateTable
CREATE TABLE "enquiries" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "company" VARCHAR(150),
    "email" VARCHAR(254) NOT NULL,
    "mobile" VARCHAR(20) NOT NULL,
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "country" VARCHAR(100),
    "message" VARCHAR(2000),
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "sales_notes" VARCHAR(5000),
    "assigned_to_id" UUID,
    "assigned_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "source_ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_line_items" (
    "id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "product_id" VARCHAR(100) NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "product_name" VARCHAR(200),
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_follow_ups" (
    "id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "note" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_status_changes" (
    "id" UUID NOT NULL,
    "enquiry_id" UUID NOT NULL,
    "from_status" "EnquiryStatus",
    "to_status" "EnquiryStatus" NOT NULL,
    "changed_by_id" UUID,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enquiries_status_idx" ON "enquiries"("status");

-- CreateIndex
CREATE INDEX "enquiries_assigned_to_id_idx" ON "enquiries"("assigned_to_id");

-- CreateIndex
CREATE INDEX "enquiries_deleted_at_created_at_idx" ON "enquiries"("deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "enquiries_email_idx" ON "enquiries"("email");

-- CreateIndex
CREATE INDEX "enquiry_line_items_enquiry_id_idx" ON "enquiry_line_items"("enquiry_id");

-- CreateIndex
CREATE INDEX "enquiry_line_items_sku_idx" ON "enquiry_line_items"("sku");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_enquiry_id_created_at_idx" ON "enquiry_follow_ups"("enquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_author_id_idx" ON "enquiry_follow_ups"("author_id");

-- CreateIndex
CREATE INDEX "enquiry_status_changes_enquiry_id_created_at_idx" ON "enquiry_status_changes"("enquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "enquiry_status_changes_changed_by_id_idx" ON "enquiry_status_changes"("changed_by_id");

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_line_items" ADD CONSTRAINT "enquiry_line_items_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_status_changes" ADD CONSTRAINT "enquiry_status_changes_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_status_changes" ADD CONSTRAINT "enquiry_status_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
