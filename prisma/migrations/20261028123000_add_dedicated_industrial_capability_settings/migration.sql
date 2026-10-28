-- CreateTable
CREATE TABLE "industrial_capability_settings" (
    "id" UUID NOT NULL,
    "eyebrow" VARCHAR(100) DEFAULT 'OUR INDUSTRIAL CAPABILITIES',
    "title" VARCHAR(200) DEFAULT 'SIX CORE SEGMENTS',
    "description" VARCHAR(1000) DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "industrial_capability_settings_pkey" PRIMARY KEY ("id")
);

-- Migrate existing settings from homepage_sections if present
INSERT INTO "industrial_capability_settings" ("id", "eyebrow", "title", "description", "created_at", "updated_at", "created_by_id", "updated_by_id")
SELECT 
    gen_random_uuid(),
    COALESCE(content->>'eyebrow', 'OUR INDUSTRIAL CAPABILITIES'),
    COALESCE(content->>'title', 'SIX CORE SEGMENTS'),
    COALESCE(content->>'description', ''),
    created_at,
    updated_at,
    created_by_id,
    updated_by_id
FROM "homepage_sections"
WHERE "type" = 'INDUSTRIAL_CAPABILITIES'
LIMIT 1;

-- Retire the legacy homepage_sections row to prevent duplicate active configuration
DELETE FROM "homepage_sections" WHERE "type" = 'INDUSTRIAL_CAPABILITIES';
