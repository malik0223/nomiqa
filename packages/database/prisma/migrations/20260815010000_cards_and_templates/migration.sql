-- CreateTable
CREATE TABLE "templates" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "latest_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "template_versions" (
    "template_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_versions_pkey" PRIMARY KEY ("template_key","version")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "template_key" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL,
    "theme" JSONB,
    "section_order" JSONB,
    "default_locale" TEXT NOT NULL DEFAULT 'ar',
    "avatar_file_id" UUID,
    "cover_file_id" UUID,
    "logo_file_id" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_localizations" (
    "card_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "job_title" TEXT,
    "organization_name" TEXT,
    "department" TEXT,
    "bio" TEXT,
    "address_line" TEXT,

    CONSTRAINT "card_localizations_pkey" PRIMARY KEY ("card_id","locale")
);

-- CreateTable
CREATE TABLE "card_links" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "platform" TEXT,
    "label" TEXT,
    "label_en" TEXT,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "card_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_publications" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "template_key" TEXT NOT NULL,
    "template_version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cards_organization_id_status_idx" ON "cards"("organization_id", "status");

-- CreateIndex
CREATE INDEX "cards_owner_user_id_idx" ON "cards"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cards_slug_key" ON "cards"("slug");

-- CreateIndex
CREATE INDEX "card_links_card_id_position_idx" ON "card_links"("card_id", "position");

-- CreateIndex
CREATE INDEX "card_publications_card_id_published_at_idx" ON "card_publications"("card_id", "published_at" DESC);

-- AddForeignKey
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_key_fkey" FOREIGN KEY ("template_key") REFERENCES "templates"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_localizations" ADD CONSTRAINT "card_localizations_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_links" ADD CONSTRAINT "card_links_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_publications" ADD CONSTRAINT "card_publications_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- عزل البطاقات
--
-- cards و card_publications تحملان organization_id مباشرة أو عبر
-- البطاقة. الجداول التابعة (localizations, links) لا تحمل العمود،
-- فتُعزل بالانتماء إلى بطاقة مرئية — وهو ما يُعبَّر عنه بـEXISTS.
--
-- templates و template_versions **بلا RLS** عمداً: مشتركة بين كل
-- المؤسسات ولا تحمل بيانات أي منها.
-- ============================================================

ALTER TABLE "cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cards" FORCE ROW LEVEL SECURITY;

CREATE POLICY cards_tenant_isolation ON "cards"
    USING ("organization_id" = app_current_organization_id())
    WITH CHECK ("organization_id" = app_current_organization_id());

ALTER TABLE "card_publications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "card_publications" FORCE ROW LEVEL SECURITY;

CREATE POLICY card_publications_tenant_isolation ON "card_publications"
    USING (EXISTS (
        SELECT 1 FROM cards c
        WHERE c.id = "card_publications"."card_id"
          AND c.organization_id = app_current_organization_id()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM cards c
        WHERE c.id = "card_publications"."card_id"
          AND c.organization_id = app_current_organization_id()
    ));

ALTER TABLE "card_localizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "card_localizations" FORCE ROW LEVEL SECURITY;

CREATE POLICY card_localizations_tenant_isolation ON "card_localizations"
    USING (EXISTS (
        SELECT 1 FROM cards c
        WHERE c.id = "card_localizations"."card_id"
          AND c.organization_id = app_current_organization_id()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM cards c
        WHERE c.id = "card_localizations"."card_id"
          AND c.organization_id = app_current_organization_id()
    ));

ALTER TABLE "card_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "card_links" FORCE ROW LEVEL SECURITY;

CREATE POLICY card_links_tenant_isolation ON "card_links"
    USING (EXISTS (
        SELECT 1 FROM cards c
        WHERE c.id = "card_links"."card_id"
          AND c.organization_id = app_current_organization_id()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM cards c
        WHERE c.id = "card_links"."card_id"
          AND c.organization_id = app_current_organization_id()
    ));

-- ============================================================
-- قراءة البطاقة المنشورة للعامة
--
-- الصفحة العامة تُفتح بلا تسجيل ولا سياق مؤسسة (§7.5)، فتحتاج قراءة
-- اللقطة المنشورة دون أي سياق.
--
-- دالة SECURITY DEFINER تُرجع **اللقطة المنشورة فقط** لبطاقة حالتها
-- published. لا تكشف المسودات ولا البطاقات الملغى نشرها ولا أي صف
-- من جداول المؤسسة — نفس المبدأ المتبع في إحصاءات الإدارة.
-- ============================================================

CREATE OR REPLACE FUNCTION public_card_by_slug(card_slug text)
RETURNS TABLE (
    card_id uuid,
    slug text,
    template_key text,
    template_version int,
    default_locale text,
    snapshot jsonb,
    published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        c.id,
        c.slug,
        p.template_key,
        p.template_version,
        c.default_locale,
        p.snapshot,
        p.published_at
    FROM cards c
    JOIN LATERAL (
        SELECT * FROM card_publications cp
        WHERE cp.card_id = c.id
        ORDER BY cp.published_at DESC
        LIMIT 1
    ) p ON true
    WHERE c.slug = card_slug
      AND c.status = 'published'
      AND c.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public_card_by_slug(text) IS
    'اللقطة المنشورة لبطاقة عامة. لا تُرجع مسودات ولا بطاقات ملغى نشرها.';

-- ============================================================
-- قوالب البداية (§7.3: 3–5 قوالب أولية)
-- ============================================================

INSERT INTO "templates" ("key", "name", "name_en", "latest_version", "is_active", "created_at")
VALUES
    ('classic', 'كلاسيكي', 'Classic', 1, true, now()),
    ('minimal', 'بسيط', 'Minimal', 1, true, now()),
    ('bold', 'جريء', 'Bold', 1, true, now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "template_versions" ("template_key", "version", "definition", "created_at")
VALUES
    ('classic', 1, '{"layout":"centered","sections":["identity","actions","links"],"supportsCover":true,"theme":{"primaryColor":"#0F766E","borderRadius":"large"}}', now()),
    ('minimal', 1, '{"layout":"start","sections":["identity","links"],"supportsCover":false,"theme":{"primaryColor":"#111827","borderRadius":"small"}}', now()),
    ('bold',    1, '{"layout":"cover","sections":["identity","actions","links"],"supportsCover":true,"theme":{"primaryColor":"#7C3AED","borderRadius":"large"}}', now())
ON CONFLICT ("template_key", "version") DO NOTHING;
