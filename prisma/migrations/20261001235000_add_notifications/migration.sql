-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "entity_type" VARCHAR(50),
    "entity_id" UUID,
    "idempotency_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_deleted_at_created_at_idx" ON "notifications"("recipient_user_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_deleted_at_read_at_created__idx" ON "notifications"("recipient_user_id", "deleted_at", "read_at", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
